CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_listener_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`country` text,
	`referer` text,
	`stream` text NOT NULL,
	`connected_at` integer NOT NULL,
	`disconnected_at` integer,
	`duration_s` integer
);
--> statement-breakpoint
INSERT INTO `__new_listener_sessions`("id", "ip", "country", "referer", "stream", "connected_at", "disconnected_at", "duration_s") SELECT "id", "ip", "country", "referer", "stream", "connected_at", "disconnected_at", "duration_s" FROM `listener_sessions`;--> statement-breakpoint
DROP TABLE `listener_sessions`;--> statement-breakpoint
ALTER TABLE `__new_listener_sessions` RENAME TO `listener_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_disconnected_at` ON `listener_sessions` (`disconnected_at`);--> statement-breakpoint
CREATE INDEX `idx_stream_disconnected` ON `listener_sessions` (`stream`,`disconnected_at`);