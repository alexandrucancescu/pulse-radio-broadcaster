CREATE TABLE `listener_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`country` text,
	`referer` text,
	`stream` text NOT NULL,
	`connected_at` integer NOT NULL,
	`disconnected_at` integer NOT NULL,
	`duration_s` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_disconnected_at` ON `listener_sessions` (`disconnected_at`);--> statement-breakpoint
CREATE INDEX `idx_stream_disconnected` ON `listener_sessions` (`stream`,`disconnected_at`);