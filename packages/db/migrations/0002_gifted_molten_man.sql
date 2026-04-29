CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`first_name` text,
	`last_name` text,
	`profile_picture_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_sign_in_at` text
);
