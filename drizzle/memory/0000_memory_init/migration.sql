CREATE TABLE `memory_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at_ms` integer NOT NULL
);

CREATE TABLE `sync_state` (
	`source_id` text PRIMARY KEY NOT NULL,
	`last_visit_time` text NOT NULL,
	`last_visit_id` text NOT NULL,
	`last_synced_at_ms` integer NOT NULL
);

CREATE TABLE `visits` (
	`source_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`browser_family` text NOT NULL,
	`browser_name` text NOT NULL,
	`profile_name` text NOT NULL,
	`url` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text,
	`visited_at_ms` integer NOT NULL,
	`domain` text,
	`visit_count` integer,
	`typed_count` integer,
	`referrer_visit_id` text,
	`transition_type` text,
	`raw_visit_time` text NOT NULL,
	`imported_at_ms` integer NOT NULL,
	PRIMARY KEY(`source_id`, `visit_id`)
);

CREATE INDEX `idx_visits_visited_at_ms` ON `visits` (`visited_at_ms`);
CREATE INDEX `idx_visits_domain` ON `visits` (`domain`);
CREATE INDEX `idx_visits_canonical_url` ON `visits` (`canonical_url`);

CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at_ms` integer NOT NULL,
	`ended_at_ms` integer NOT NULL,
	`visit_count` integer NOT NULL,
	`primary_domain` text,
	`title` text NOT NULL,
	`importance_score` real NOT NULL,
	`evidence_json` text NOT NULL
);

CREATE INDEX `idx_sessions_started_at_ms` ON `sessions` (`started_at_ms`);
CREATE INDEX `idx_sessions_primary_domain` ON `sessions` (`primary_domain`);

CREATE TABLE `session_visits` (
	`session_id` text NOT NULL,
	`source_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`session_id`, `source_id`, `visit_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade,
	FOREIGN KEY (`source_id`, `visit_id`) REFERENCES `visits`(`source_id`, `visit_id`) ON DELETE cascade
);

CREATE TABLE `session_insights` (
	`session_id` text PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`themes_json` text NOT NULL,
	`behavior_signals_json` text NOT NULL,
	`goal_hypotheses_json` text NOT NULL,
	`confidence` real NOT NULL,
	`model` text NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade
);
