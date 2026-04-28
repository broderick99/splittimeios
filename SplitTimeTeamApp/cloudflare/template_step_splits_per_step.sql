-- Adds per-step split count support to template steps.

ALTER TABLE team_template_steps
ADD COLUMN splits_per_step INTEGER NOT NULL DEFAULT 1;
