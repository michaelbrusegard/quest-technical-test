use std::{fs, path::Path, sync::Mutex};

use rusqlite::{Connection, params_from_iter, types::ValueRef};

use super::types::{MemoryQueryRequest, MemoryQueryResult};

pub const MEMORY_DATABASE_PATH: &str = "memory/memory.sqlite";

pub struct MemoryState {
    connection: Mutex<Connection>,
    #[cfg(test)]
    path: std::path::PathBuf,
}

impl MemoryState {
    pub fn new(app_local_data_dir: &Path) -> Result<Self, String> {
        let path = app_local_data_dir.join(MEMORY_DATABASE_PATH);
        let parent = path
            .parent()
            .ok_or_else(|| "could not resolve memory database parent directory".to_string())?;

        fs::create_dir_all(parent).map_err(|error| error.to_string())?;

        let connection = Connection::open(&path).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
            )
            .map_err(|error| error.to_string())?;

        Ok(Self {
            connection: Mutex::new(connection),
            #[cfg(test)]
            path,
        })
    }

    #[cfg(test)]
    fn path(&self) -> &Path {
        &self.path
    }
}

pub fn execute_query(
    state: &MemoryState,
    request: &MemoryQueryRequest,
) -> Result<MemoryQueryResult, String> {
    let connection = state.connection.lock().map_err(|error| error.to_string())?;
    execute_query_on_connection(&connection, request).map_err(|error| error.to_string())
}

pub fn execute_batch(
    state: &MemoryState,
    batch: &[MemoryQueryRequest],
) -> Result<Vec<MemoryQueryResult>, String> {
    let mut connection = state.connection.lock().map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let mut results = Vec::with_capacity(batch.len());

    for request in batch {
        results.push(
            execute_query_on_connection(&transaction, request)
                .map_err(|error| error.to_string())?,
        );
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(results)
}

fn execute_query_on_connection(
    connection: &Connection,
    request: &MemoryQueryRequest,
) -> rusqlite::Result<MemoryQueryResult> {
    let params = request
        .params
        .iter()
        .map(json_to_sqlite_value)
        .collect::<Vec<_>>();

    match request.method.as_str() {
        "run" => {
            if params.is_empty() {
                connection.execute_batch(&request.sql)?;
            } else {
                connection.execute(&request.sql, params_from_iter(params.iter()))?;
            }
            Ok(MemoryQueryResult { rows: Some(vec![]) })
        }
        "all" | "values" | "get" => {
            let mut statement = connection.prepare(&request.sql)?;
            let mut rows = statement.query(params_from_iter(params.iter()))?;
            let mut values = Vec::new();

            while let Some(row) = rows.next()? {
                values.push(row_to_json_values(row)?);

                if request.method == "get" {
                    break;
                }
            }

            if request.method == "get" && values.is_empty() {
                Ok(MemoryQueryResult { rows: None })
            } else {
                Ok(MemoryQueryResult { rows: Some(values) })
            }
        }
        _ => Err(rusqlite::Error::InvalidParameterName(format!(
            "unsupported memory query method: {}",
            request.method,
        ))),
    }
}

fn json_to_sqlite_value(value: &serde_json::Value) -> rusqlite::types::Value {
    match value {
        serde_json::Value::Null => rusqlite::types::Value::Null,
        serde_json::Value::Bool(value) => rusqlite::types::Value::Integer(i64::from(*value)),
        serde_json::Value::Number(value) => value
            .as_i64()
            .map(rusqlite::types::Value::Integer)
            .or_else(|| value.as_f64().map(rusqlite::types::Value::Real))
            .unwrap_or(rusqlite::types::Value::Null),
        serde_json::Value::String(value) => rusqlite::types::Value::Text(value.clone()),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            rusqlite::types::Value::Text(value.to_string())
        }
    }
}

fn row_to_json_values(row: &rusqlite::Row<'_>) -> rusqlite::Result<Vec<serde_json::Value>> {
    let statement = row.as_ref();
    let mut values = Vec::with_capacity(statement.column_count());

    for index in 0..statement.column_count() {
        let value = match row.get_ref(index)? {
            ValueRef::Null => serde_json::Value::Null,
            ValueRef::Integer(value) => serde_json::Value::from(value),
            ValueRef::Real(value) => serde_json::Value::from(value),
            ValueRef::Text(value) => {
                serde_json::Value::String(String::from_utf8_lossy(value).into_owned())
            }
            ValueRef::Blob(value) => serde_json::Value::Array(
                value.iter().copied().map(serde_json::Value::from).collect(),
            ),
        };
        values.push(value);
    }

    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_memory_state() -> MemoryState {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("quest-memory-{suffix}"));
        fs::create_dir_all(&root).expect("failed to create temp root");
        MemoryState::new(&root).expect("failed to create memory state")
    }

    #[test]
    fn initializes_memory_database_under_v2_path() {
        let state = create_memory_state();

        assert!(state.path().ends_with(MEMORY_DATABASE_PATH));
        assert!(state.path().exists());
    }

    #[test]
    fn preserves_selected_column_order() {
        let state = create_memory_state();

        execute_query(
            &state,
            &MemoryQueryRequest {
                sql: "CREATE TABLE sample (id INTEGER PRIMARY KEY, title TEXT NOT NULL, score REAL NOT NULL)".to_string(),
                params: vec![],
                method: "run".to_string(),
            },
        )
        .expect("failed to create sample table");
        execute_query(
            &state,
            &MemoryQueryRequest {
                sql: "INSERT INTO sample (id, title, score) VALUES (?, ?, ?)".to_string(),
                params: vec![1.into(), "alpha".into(), 2.5.into()],
                method: "run".to_string(),
            },
        )
        .expect("failed to insert sample row");

        let result = execute_query(
            &state,
            &MemoryQueryRequest {
                sql: "SELECT title, id, score FROM sample".to_string(),
                params: vec![],
                method: "all".to_string(),
            },
        )
        .expect("failed to query sample rows");

        assert_eq!(
            result.rows,
            Some(vec![vec!["alpha".into(), 1.into(), 2.5.into()]]),
        );
    }

    #[test]
    fn returns_none_for_empty_get_queries() {
        let state = create_memory_state();

        execute_query(
            &state,
            &MemoryQueryRequest {
                sql: "CREATE TABLE sample (id INTEGER PRIMARY KEY, title TEXT NOT NULL)"
                    .to_string(),
                params: vec![],
                method: "run".to_string(),
            },
        )
        .expect("failed to create sample table");

        let result = execute_query(
            &state,
            &MemoryQueryRequest {
                sql: "SELECT id, title FROM sample WHERE id = ?".to_string(),
                params: vec![99.into()],
                method: "get".to_string(),
            },
        )
        .expect("failed to query sample row");

        assert_eq!(result.rows, None);
    }

    #[test]
    fn executes_batch_in_a_single_transaction() {
        let state = create_memory_state();

        let results = execute_batch(
            &state,
            &[
                MemoryQueryRequest {
                    sql: "CREATE TABLE sample (id INTEGER PRIMARY KEY, title TEXT NOT NULL)"
                        .to_string(),
                    params: vec![],
                    method: "run".to_string(),
                },
                MemoryQueryRequest {
                    sql: "INSERT INTO sample (id, title) VALUES (?, ?)".to_string(),
                    params: vec![1.into(), "beta".into()],
                    method: "run".to_string(),
                },
                MemoryQueryRequest {
                    sql: "SELECT id, title FROM sample".to_string(),
                    params: vec![],
                    method: "all".to_string(),
                },
            ],
        )
        .expect("failed to execute query batch");

        assert_eq!(results[2].rows, Some(vec![vec![1.into(), "beta".into()]]));
    }
}
