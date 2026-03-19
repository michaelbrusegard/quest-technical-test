CREATE TABLE `search_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`source_type` text NOT NULL,
	`title` text NOT NULL,
	`primary_domain` text,
	`search_text` text NOT NULL,
	`embedding_json` text,
	`content_hash` text NOT NULL,
	`embedding_model` text,
	`started_at_ms` integer NOT NULL,
	`ended_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade
);

CREATE INDEX `idx_search_documents_session_id` ON `search_documents` (`session_id`);
CREATE INDEX `idx_search_documents_source_type` ON `search_documents` (`source_type`);
CREATE INDEX `idx_search_documents_started_at_ms` ON `search_documents` (`started_at_ms`);
