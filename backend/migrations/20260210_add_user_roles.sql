-- Add role field to user_plans table
ALTER TABLE user_plans 
ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- Add comment for clarity
COMMENT ON COLUMN user_plans.role IS 'User role: user | admin';
