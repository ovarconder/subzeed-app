-- ============================================================
-- SubZeed — Supabase Database Schema
-- ============================================================

-- ENUMs
CREATE TYPE subscription_tier AS ENUM ('free', 'basic', 'premium', 'business_starter', 'business_pro');
CREATE TYPE billing_action_type AS ENUM ('subscribe', 'renew_early', 'recurring', 'cancel', 'refund');
CREATE TYPE quota_log_type AS ENUM ('stt_transcription', 'renew_reset', 'admin_adjustment');

-- 1. Profiles
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    tier subscription_tier DEFAULT 'free' NOT NULL,
    quota_minutes_total NUMERIC(10, 2) DEFAULT 20.00 NOT NULL,
    quota_minutes_used NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    billing_cycle_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    billing_cycle_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month') NOT NULL,
    workspace_owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Projects
CREATE TABLE projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT 'วิดีโอไม่มีชื่อ' NOT NULL,
    video_url TEXT,
    duration_seconds NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    subtitles JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_client_review_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    review_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Billing History
CREATE TABLE billing_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    action_type billing_action_type NOT NULL,
    previous_tier subscription_tier NOT NULL,
    new_tier subscription_tier NOT NULL,
    amount_thb NUMERIC(10, 2) NOT NULL,
    invoice_number TEXT UNIQUE,
    billing_cycle_start TIMESTAMPTZ NOT NULL,
    billing_cycle_end TIMESTAMPTZ NOT NULL,
    payment_status TEXT DEFAULT 'success' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Quota Activity Logs
CREATE TABLE quota_activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    log_type quota_log_type NOT NULL,
    minutes_changed NUMERIC(10, 2) NOT NULL,
    quota_minutes_used_snapshot NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_billing_history_user_id ON billing_history(user_id);
CREATE INDEX idx_quota_logs_user_id ON quota_activity_logs(user_id);
CREATE INDEX idx_profiles_workspace_owner ON profiles(workspace_owner_id);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Profiles: users can only see/update own profile
CREATE POLICY "Users view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Projects: users can CRUD own projects, workspace owners can see team projects
CREATE POLICY "Users view own projects"
    ON projects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own projects"
    ON projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own projects"
    ON projects FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users delete own projects"
    ON projects FOR DELETE
    USING (auth.uid() = user_id);

-- Billing: users can view own billing
CREATE POLICY "Users view own billing"
    ON billing_history FOR SELECT
    USING (auth.uid() = user_id);

-- Quota logs: users can view own logs
CREATE POLICY "Users view own quota logs"
    ON quota_activity_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, tier, quota_minutes_total, quota_minutes_used)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'tier', 'free')::subscription_tier,
        CASE
            WHEN NEW.raw_user_meta_data ->> 'tier' = 'basic' THEN 120
            WHEN NEW.raw_user_meta_data ->> 'tier' = 'premium' THEN 300
            WHEN NEW.raw_user_meta_data ->> 'tier' = 'business_starter' THEN 1200
            WHEN NEW.raw_user_meta_data ->> 'tier' = 'business_pro' THEN 2500
            ELSE 20
        END,
        0
    );
    RETURN NEW;
END;
$$;

-- Trigger after auth signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
