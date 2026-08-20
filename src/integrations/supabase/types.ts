export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      courses: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          difficulty: string;
          id: string;
          lesson_count: number;
          passing_ratio: number;
          published: boolean;
          thumbnail_url: string | null;
          title: string;
          total_duration_seconds: number;
          updated_at: string;
          xp_reward: number;
          youtube_playlist_id: string | null;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          difficulty?: string;
          id?: string;
          lesson_count?: number;
          passing_ratio?: number;
          published?: boolean;
          thumbnail_url?: string | null;
          title: string;
          total_duration_seconds?: number;
          updated_at?: string;
          xp_reward?: number;
          youtube_playlist_id?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          difficulty?: string;
          id?: string;
          lesson_count?: number;
          passing_ratio?: number;
          published?: boolean;
          thumbnail_url?: string | null;
          title?: string;
          total_duration_seconds?: number;
          updated_at?: string;
          xp_reward?: number;
          youtube_playlist_id?: string | null;
        };
        Relationships: [];
      };
      course_lessons: {
        Row: {
          course_id: string;
          description: string | null;
          duration_seconds: number;
          id: string;
          sort_order: number;
          title: string;
          video_id: string;
        };
        Insert: {
          course_id: string;
          description?: string | null;
          duration_seconds?: number;
          id?: string;
          sort_order?: number;
          title: string;
          video_id: string;
        };
        Update: {
          course_id?: string;
          description?: string | null;
          duration_seconds?: number;
          id?: string;
          sort_order?: number;
          title?: string;
          video_id?: string;
        };
        Relationships: [];
      };
      course_enrollments: {
        Row: {
          completed_at: string | null;
          completed_lessons: number;
          course_id: string;
          progress_percent: number;
          started_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          completed_lessons?: number;
          course_id: string;
          progress_percent?: number;
          started_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          completed_lessons?: number;
          course_id?: string;
          progress_percent?: number;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lesson_progress: {
        Row: {
          completed: boolean;
          last_position_seconds: number;
          lesson_id: string;
          updated_at: string;
          user_id: string;
          watched_seconds: number;
        };
        Insert: {
          completed?: boolean;
          last_position_seconds?: number;
          lesson_id: string;
          updated_at?: string;
          user_id: string;
          watched_seconds?: number;
        };
        Update: {
          completed?: boolean;
          last_position_seconds?: number;
          lesson_id?: string;
          updated_at?: string;
          user_id?: string;
          watched_seconds?: number;
        };
        Relationships: [];
      };
      competition_invites: {
        Row: {
          competition_id: string;
          created_at: string;
          invited_by: string | null;
          user_id: string;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          invited_by?: string | null;
          user_id: string;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          invited_by?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      certificates: {
        Row: {
          course_id: string;
          course_title: string;
          id: string;
          issued_at: string;
          recipient_name: string;
          serial: string;
          user_id: string;
        };
        Insert: {
          course_id: string;
          course_title: string;
          id?: string;
          issued_at?: string;
          recipient_name: string;
          serial: string;
          user_id: string;
        };
        Update: {
          course_id?: string;
          course_title?: string;
          id?: string;
          issued_at?: string;
          recipient_name?: string;
          serial?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      badges: {
        Row: {
          category: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          name: string;
          xp_required: number;
        };
        Insert: {
          category?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          xp_required?: number;
        };
        Update: {
          category?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          xp_required?: number;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          author_avatar: string | null;
          author_name: string | null;
          content_id: string | null;
          created_at: string;
          id: string;
          likes_count: number;
          parent_id: string | null;
          text: string;
          user_id: string;
        };
        Insert: {
          author_avatar?: string | null;
          author_name?: string | null;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          likes_count?: number;
          parent_id?: string | null;
          text: string;
          user_id: string;
        };
        Update: {
          author_avatar?: string | null;
          author_name?: string | null;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          likes_count?: number;
          parent_id?: string | null;
          text?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_participants: {
        Row: {
          answered_count: number;
          avatar_url: string | null;
          competition_id: string;
          correct_count: number;
          finished: boolean;
          finished_at: string | null;
          joined_at: string;
          score: number;
          user_id: string;
          username: string | null;
        };
        Insert: {
          answered_count?: number;
          avatar_url?: string | null;
          competition_id: string;
          correct_count?: number;
          finished?: boolean;
          finished_at?: string | null;
          joined_at?: string;
          score?: number;
          user_id: string;
          username?: string | null;
        };
        Update: {
          answered_count?: number;
          avatar_url?: string | null;
          competition_id?: string;
          correct_count?: number;
          finished?: boolean;
          finished_at?: string | null;
          joined_at?: string;
          score?: number;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competition_participants_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_questions: {
        Row: {
          competition_id: string;
          correct_option_index: number;
          created_at: string;
          explanation: string | null;
          id: string;
          options: string[];
          question: string;
          sort_order: number;
        };
        Insert: {
          competition_id: string;
          correct_option_index: number;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          options: string[];
          question: string;
          sort_order?: number;
        };
        Update: {
          competition_id?: string;
          correct_option_index?: number;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          options?: string[];
          question?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "competition_questions_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
        ];
      };
      competitions: {
        Row: {
          category: string;
          created_at: string;
          difficulty: string;
          finished_at: string | null;
          host_id: string;
          host_name: string | null;
          id: string;
          question_count: number;
          source_course_id: string | null;
          opponent_id: string | null;
          visibility: string;
          mode: string;
          seconds_per_question: number;
          started_at: string | null;
          status: string;
          topic: string;
          updated_at: string;
          xp_reward: number;
        };
        Insert: {
          category?: string;
          created_at?: string;
          difficulty?: string;
          finished_at?: string | null;
          host_id: string;
          host_name?: string | null;
          id?: string;
          question_count?: number;
          source_course_id?: string | null;
          opponent_id?: string | null;
          visibility?: string;
          mode?: string;
          seconds_per_question?: number;
          started_at?: string | null;
          status?: string;
          topic: string;
          updated_at?: string;
          xp_reward?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          difficulty?: string;
          finished_at?: string | null;
          host_id?: string;
          host_name?: string | null;
          id?: string;
          question_count?: number;
          source_course_id?: string | null;
          opponent_id?: string | null;
          visibility?: string;
          mode?: string;
          seconds_per_question?: number;
          started_at?: string | null;
          status?: string;
          topic?: string;
          updated_at?: string;
          xp_reward?: number;
        };
        Relationships: [
          {
            foreignKeyName: "competitions_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_likes: {
        Row: {
          content_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          content_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_likes_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_saves: {
        Row: {
          content_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          content_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_saves_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_saves_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_admins: {
        Row: {
          added_at: string;
          email: string;
        };
        Insert: {
          added_at?: string;
          email: string;
        };
        Update: {
          added_at?: string;
          email?: string;
        };
        Relationships: [];
      };
      contents: {
        Row: {
          author_avatar: string | null;
          author_id: string | null;
          author_name: string | null;
          category: string;
          comments_count: number;
          content_type: string;
          created_at: string;
          description: string | null;
          difficulty: string;
          id: string;
          image_url: string | null;
          likes_count: number;
          room_id: string | null;
          shares_count: number;
          source_course_id: string | null;
          source_lesson_id: string | null;
          tags: string[] | null;
          text_content: string | null;
          title: string;
          video_id: string | null;
          video_url: string | null;
          views_count: number;
          xp_reward: number;
        };
        Insert: {
          author_avatar?: string | null;
          author_id?: string | null;
          author_name?: string | null;
          category: string;
          comments_count?: number;
          content_type: string;
          created_at?: string;
          description?: string | null;
          difficulty?: string;
          id?: string;
          image_url?: string | null;
          likes_count?: number;
          room_id?: string | null;
          shares_count?: number;
          source_course_id?: string | null;
          source_lesson_id?: string | null;
          tags?: string[] | null;
          text_content?: string | null;
          title: string;
          video_id?: string | null;
          video_url?: string | null;
          views_count?: number;
          xp_reward?: number;
        };
        Update: {
          author_avatar?: string | null;
          author_id?: string | null;
          author_name?: string | null;
          category?: string;
          comments_count?: number;
          content_type?: string;
          created_at?: string;
          description?: string | null;
          difficulty?: string;
          id?: string;
          image_url?: string | null;
          likes_count?: number;
          room_id?: string | null;
          shares_count?: number;
          source_course_id?: string | null;
          source_lesson_id?: string | null;
          tags?: string[] | null;
          text_content?: string | null;
          title?: string;
          video_id?: string | null;
          video_url?: string | null;
          views_count?: number;
          xp_reward?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contents_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contents_source_course_id_fkey";
            columns: ["source_course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contents_source_lesson_id_fkey";
            columns: ["source_lesson_id"];
            isOneToOne: true;
            referencedRelation: "course_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      missions: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          created_at: string;
          current_progress: number;
          description: string | null;
          frequency: string;
          id: string;
          mission_type: string;
          target_value: number;
          title: string;
          user_id: string;
          xp_reward: number;
        };
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          current_progress?: number;
          description?: string | null;
          frequency?: string;
          id?: string;
          mission_type: string;
          target_value: number;
          title: string;
          user_id: string;
          xp_reward?: number;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          current_progress?: number;
          description?: string | null;
          frequency?: string;
          id?: string;
          mission_type?: string;
          target_value?: number;
          title?: string;
          user_id?: string;
          xp_reward?: number;
        };
        Relationships: [
          {
            foreignKeyName: "missions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message: string | null;
          read: boolean;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message?: string | null;
          read?: boolean;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string | null;
          read?: boolean;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          bio: string | null;
          created_at: string;
          education_level: string | null;
          email: string;
          id: string;
          interests: string[] | null;
          last_login_date: string | null;
          level: string | null;
          onboarding_completed: boolean;
          preferred_language: string | null;
          share_progress: boolean;
          profile_image_url: string | null;
          streak: number;
          username: string;
          xp: number;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          education_level?: string | null;
          email: string;
          id: string;
          interests?: string[] | null;
          last_login_date?: string | null;
          level?: string | null;
          onboarding_completed?: boolean;
          preferred_language?: string | null;
          share_progress?: boolean;
          profile_image_url?: string | null;
          streak?: number;
          username: string;
          xp?: number;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          education_level?: string | null;
          email?: string;
          id?: string;
          interests?: string[] | null;
          last_login_date?: string | null;
          level?: string | null;
          onboarding_completed?: boolean;
          preferred_language?: string | null;
          share_progress?: boolean;
          profile_image_url?: string | null;
          streak?: number;
          username?: string;
          xp?: number;
        };
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          answers: number[] | null;
          completed_at: string;
          content_id: string | null;
          id: string;
          score: number | null;
          total_questions: number | null;
          user_id: string;
        };
        Insert: {
          answers?: number[] | null;
          completed_at?: string;
          content_id?: string | null;
          id?: string;
          score?: number | null;
          total_questions?: number | null;
          user_id: string;
        };
        Update: {
          answers?: number[] | null;
          completed_at?: string;
          content_id?: string | null;
          id?: string;
          score?: number | null;
          total_questions?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_questions: {
        Row: {
          content_id: string | null;
          correct_option_index: number;
          explanation: string | null;
          id: string;
          options: string[];
          question: string;
          sort_order: number;
        };
        Insert: {
          content_id?: string | null;
          correct_option_index: number;
          explanation?: string | null;
          id?: string;
          options: string[];
          question: string;
          sort_order?: number;
        };
        Update: {
          content_id?: string | null;
          correct_option_index?: number;
          explanation?: string | null;
          id?: string;
          options?: string[];
          question?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_questions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
        ];
      };
      room_members: {
        Row: {
          joined_at: string;
          role: string;
          room_id: string;
          user_id: string;
          xp_in_room: number;
        };
        Insert: {
          joined_at?: string;
          role?: string;
          room_id: string;
          user_id: string;
          xp_in_room?: number;
        };
        Update: {
          joined_at?: string;
          role?: string;
          room_id?: string;
          user_id?: string;
          xp_in_room?: number;
        };
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "room_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      room_posts: {
        Row: {
          created_at: string;
          id: string;
          likes_count: number;
          room_id: string;
          text: string;
          user_id: string;
          username: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          likes_count?: number;
          room_id: string;
          text: string;
          user_id: string;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          likes_count?: number;
          room_id?: string;
          text?: string;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "room_posts_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "room_posts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          member_count: number;
          name: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          member_count?: number;
          name: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          member_count?: number;
          name?: string;
        };
        Relationships: [];
      };
      user_badges: {
        Row: {
          badge_id: string;
          earned_at: string;
          user_id: string;
        };
        Insert: {
          badge_id: string;
          earned_at?: string;
          user_id: string;
        };
        Update: {
          badge_id?: string;
          earned_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey";
            columns: ["badge_id"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_badges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      video_engagements: {
        Row: {
          commented: boolean;
          completion_percentage: number;
          content_id: string | null;
          created_at: string;
          id: string;
          liked: boolean;
          saved: boolean;
          shared: boolean;
          user_id: string;
          watch_time_seconds: number;
        };
        Insert: {
          commented?: boolean;
          completion_percentage?: number;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          liked?: boolean;
          saved?: boolean;
          shared?: boolean;
          user_id: string;
          watch_time_seconds?: number;
        };
        Update: {
          commented?: boolean;
          completion_percentage?: number;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          liked?: boolean;
          saved?: boolean;
          shared?: boolean;
          user_id?: string;
          watch_time_seconds?: number;
        };
        Relationships: [
          {
            foreignKeyName: "video_engagements_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_engagements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_xp: { Args: { amount: number }; Returns: number };
      increment_shares: { Args: { content_id: string }; Returns: number };
      invite_to_competition: {
        Args: { p_competition_id: string; p_user_id: string };
        Returns: boolean;
      };
      create_course_duel: {
        Args: {
          p_course_id: string;
          p_opponent_id: string;
          p_visibility?: string;
          p_question_count?: number;
        };
        Returns: string;
      };
      record_lesson_progress: {
        Args: {
          p_lesson_id: string;
          p_watched_delta: number;
          p_position?: number;
          p_duration?: number;
        };
        Returns: Json;
      };
      delete_content: {
        Args: {
          p_content_id: string;
        };
        Returns: boolean;
      };
      is_app_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      set_lesson_in_feed: {
        Args: {
          p_lesson_id: string;
          p_in_feed: boolean;
        };
        Returns: string | null;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
