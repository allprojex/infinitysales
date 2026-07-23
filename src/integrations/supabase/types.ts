export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_key_alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_at: string;
          error_excerpt: string | null;
          id: string;
          source: string;
          upstream_status: number;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          error_excerpt?: string | null;
          id?: string;
          source: string;
          upstream_status: number;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          error_excerpt?: string | null;
          id?: string;
          source?: string;
          upstream_status?: number;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          clock_in: string | null;
          clock_out: string | null;
          created_at: string;
          date: string;
          employee_id: string;
          id: string;
          notes: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          clock_in?: string | null;
          clock_out?: string | null;
          created_at?: string;
          date: string;
          employee_id: string;
          id?: string;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          clock_in?: string | null;
          clock_out?: string | null;
          created_at?: string;
          date?: string;
          employee_id?: string;
          id?: string;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          details: Json | null;
          entity_id: string | null;
          entity_name: string | null;
          entity_type: string;
          id: string;
          status: string;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_name?: string | null;
          entity_type: string;
          id?: string;
          status?: string;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_name?: string | null;
          entity_type?: string;
          id?: string;
          status?: string;
        };
        Relationships: [];
      };
      backup_records: {
        Row: {
          created_at: string;
          filename: string;
          id: number;
          payload: Json | null;
          row_count: number;
          size_bytes: number;
          table_count: number;
          tables: string[] | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filename: string;
          id?: number;
          payload?: Json | null;
          row_count?: number;
          size_bytes?: number;
          table_count?: number;
          tables?: string[] | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filename?: string;
          id?: number;
          payload?: Json | null;
          row_count?: number;
          size_bytes?: number;
          table_count?: number;
          tables?: string[] | null;
          user_id?: string;
        };
        Relationships: [];
      };
      bank_accounts: {
        Row: {
          account_number: string | null;
          account_type: string | null;
          bank_name: string | null;
          created_at: string;
          currency: string | null;
          current_balance: number | null;
          iban: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          notes: string | null;
          opening_balance: number | null;
          swift: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_number?: string | null;
          account_type?: string | null;
          bank_name?: string | null;
          created_at?: string;
          currency?: string | null;
          current_balance?: number | null;
          iban?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          notes?: string | null;
          opening_balance?: number | null;
          swift?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_number?: string | null;
          account_type?: string | null;
          bank_name?: string | null;
          created_at?: string;
          currency?: string | null;
          current_balance?: number | null;
          iban?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          notes?: string | null;
          opening_balance?: number | null;
          swift?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bank_transactions: {
        Row: {
          amount: number;
          bank_account_id: string;
          category: string | null;
          created_at: string;
          description: string | null;
          id: string;
          notes: string | null;
          occurred_at: string;
          reconciled: boolean;
          reconciled_at: string | null;
          reconciled_by: string | null;
          reference: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          bank_account_id: string;
          category?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          reconciled?: boolean;
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          reference?: string | null;
          type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          bank_account_id?: string;
          category?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          reconciled?: boolean;
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          reference?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          address: string | null;
          city: string | null;
          code: string | null;
          created_at: string;
          email: string | null;
          id: number;
          is_active: boolean;
          is_default: boolean;
          manager_id: number | null;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
          uuid_id: string;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          code?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          is_active?: boolean;
          is_default?: boolean;
          manager_id?: number | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
          uuid_id?: string;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          code?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          is_active?: boolean;
          is_default?: boolean;
          manager_id?: number | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
          uuid_id?: string;
        };
        Relationships: [];
      };
      cash_movements: {
        Row: {
          amount: number;
          cash_session_id: string;
          created_at: string;
          id: string;
          occurred_at: string;
          reason: string | null;
          reference: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          cash_session_id: string;
          created_at?: string;
          id?: string;
          occurred_at?: string;
          reason?: string | null;
          reference?: string | null;
          type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          cash_session_id?: string;
          created_at?: string;
          id?: string;
          occurred_at?: string;
          reason?: string | null;
          reference?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey";
            columns: ["cash_session_id"];
            isOneToOne: false;
            referencedRelation: "cash_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_sessions: {
        Row: {
          branch_id: string | null;
          cashier_id: string | null;
          closed_at: string | null;
          closing_balance: number | null;
          created_at: string;
          difference: number | null;
          expected_balance: number | null;
          id: string;
          notes: string | null;
          opened_at: string;
          opening_balance: number | null;
          status: string | null;
          terminal: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          branch_id?: string | null;
          cashier_id?: string | null;
          closed_at?: string | null;
          closing_balance?: number | null;
          created_at?: string;
          difference?: number | null;
          expected_balance?: number | null;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opening_balance?: number | null;
          status?: string | null;
          terminal?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          branch_id?: string | null;
          cashier_id?: string | null;
          closed_at?: string | null;
          closing_balance?: number | null;
          created_at?: string;
          difference?: number | null;
          expected_balance?: number | null;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opening_balance?: number | null;
          status?: string | null;
          terminal?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          address: string | null;
          city: string | null;
          company: string | null;
          created_at: string;
          email: string | null;
          id: number;
          name: string;
          notes: string | null;
          phone: string | null;
          role: string | null;
          tags: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          company?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          name: string;
          notes?: string | null;
          phone?: string | null;
          role?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          company?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          role?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      customer_credits: {
        Row: {
          amount: number;
          created_at: string;
          customer_id: string;
          id: string;
          notes: string | null;
          occurred_at: string;
          reference: string | null;
          type: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          customer_id: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          reference?: string | null;
          type?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          customer_id?: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          reference?: string | null;
          type?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          address: string | null;
          company: string | null;
          created_at: string;
          email: string;
          id: number;
          name: string;
          phone: string | null;
          status: string;
          total_spend: number;
          updated_at: string;
          user_id: string;
          uuid_id: string;
        };
        Insert: {
          address?: string | null;
          company?: string | null;
          created_at?: string;
          email: string;
          id?: number;
          name: string;
          phone?: string | null;
          status?: string;
          total_spend?: number;
          updated_at?: string;
          user_id: string;
          uuid_id?: string;
        };
        Update: {
          address?: string | null;
          company?: string | null;
          created_at?: string;
          email?: string;
          id?: number;
          name?: string;
          phone?: string | null;
          status?: string;
          total_spend?: number;
          updated_at?: string;
          user_id?: string;
          uuid_id?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          budget: number | null;
          created_at: string;
          description: string | null;
          head_name: string | null;
          id: string;
          location: string | null;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          budget?: number | null;
          created_at?: string;
          description?: string | null;
          head_name?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          budget?: number | null;
          created_at?: string;
          description?: string | null;
          head_name?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      duty_roster: {
        Row: {
          created_at: string;
          id: string;
          location: string | null;
          notes: string | null;
          shift_date: string;
          shift_end: string;
          shift_start: string;
          shift_type: string;
          status: string;
          updated_at: string;
          user_email: string | null;
          user_id: string;
          user_name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          location?: string | null;
          notes?: string | null;
          shift_date: string;
          shift_end: string;
          shift_start: string;
          shift_type?: string;
          status?: string;
          updated_at?: string;
          user_email?: string | null;
          user_id: string;
          user_name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          location?: string | null;
          notes?: string | null;
          shift_date?: string;
          shift_end?: string;
          shift_start?: string;
          shift_type?: string;
          status?: string;
          updated_at?: string;
          user_email?: string | null;
          user_id?: string;
          user_name?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          address: string | null;
          city: string | null;
          created_at: string;
          department: string | null;
          email: string | null;
          hire_date: string | null;
          id: string;
          job_title: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          salary: number | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          created_at?: string;
          department?: string | null;
          email?: string | null;
          hire_date?: string | null;
          id?: string;
          job_title?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          salary?: number | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          created_at?: string;
          department?: string | null;
          email?: string | null;
          hire_date?: string | null;
          id?: string;
          job_title?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          salary?: number | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      esl_devices: {
        Row: {
          battery: number | null;
          branch_id: string | null;
          created_at: string;
          device_id: string;
          id: string;
          last_synced_at: string | null;
          notes: string | null;
          product_id: string | null;
          status: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          battery?: number | null;
          branch_id?: string | null;
          created_at?: string;
          device_id: string;
          id?: string;
          last_synced_at?: string | null;
          notes?: string | null;
          product_id?: string | null;
          status?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          battery?: number | null;
          branch_id?: string | null;
          created_at?: string;
          device_id?: string;
          id?: string;
          last_synced_at?: string | null;
          notes?: string | null;
          product_id?: string | null;
          status?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "esl_devices_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      esl_sync_history: {
        Row: {
          created_at: string;
          device_id: string | null;
          id: string;
          message: string | null;
          status: string | null;
          synced_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id?: string | null;
          id?: string;
          message?: string | null;
          status?: string | null;
          synced_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string | null;
          id?: string;
          message?: string | null;
          status?: string | null;
          synced_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount: number;
          bank_account_id: string | null;
          branch_id: string | null;
          category: string | null;
          category_other: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          expense_date: string | null;
          id: string;
          notes: string | null;
          payment_method: string | null;
          receipt_note: string | null;
          receipt_url: string | null;
          reference: string | null;
          spent_at: string | null;
          status: string | null;
          supplier_id: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          bank_account_id?: string | null;
          branch_id?: string | null;
          category?: string | null;
          category_other?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expense_date?: string | null;
          id?: string;
          notes?: string | null;
          payment_method?: string | null;
          receipt_note?: string | null;
          receipt_url?: string | null;
          reference?: string | null;
          spent_at?: string | null;
          status?: string | null;
          supplier_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          bank_account_id?: string | null;
          branch_id?: string | null;
          category?: string | null;
          category_other?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expense_date?: string | null;
          id?: string;
          notes?: string | null;
          payment_method?: string | null;
          receipt_note?: string | null;
          receipt_url?: string | null;
          reference?: string | null;
          spent_at?: string | null;
          status?: string | null;
          supplier_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      generated_reports: {
        Row: {
          created_at: string;
          data: Json | null;
          file_url: string | null;
          id: number;
          notes: string | null;
          period: string | null;
          status: string;
          title: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data?: Json | null;
          file_url?: string | null;
          id?: number;
          notes?: string | null;
          period?: string | null;
          status?: string;
          title: string;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json | null;
          file_url?: string | null;
          id?: number;
          notes?: string | null;
          period?: string | null;
          status?: string;
          title?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ip_blocks: {
        Row: {
          blocked_until: string | null;
          created_at: string;
          failed_attempts: number;
          id: number;
          ip_address: string;
          reason: string;
          user_id: string;
        };
        Insert: {
          blocked_until?: string | null;
          created_at?: string;
          failed_attempts?: number;
          id?: number;
          ip_address: string;
          reason?: string;
          user_id: string;
        };
        Update: {
          blocked_until?: string | null;
          created_at?: string;
          failed_attempts?: number;
          id?: number;
          ip_address?: string;
          reason?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      label_print_jobs: {
        Row: {
          copies: number;
          created_at: string;
          id: number;
          label_type: string | null;
          payload: Json;
          printer_id: string | null;
          printer_name: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          copies?: number;
          created_at?: string;
          id?: number;
          label_type?: string | null;
          payload?: Json;
          printer_id?: string | null;
          printer_name?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          copies?: number;
          created_at?: string;
          id?: number;
          label_type?: string | null;
          payload?: Json;
          printer_id?: string | null;
          printer_name?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      leave_requests: {
        Row: {
          approved_by: string | null;
          created_at: string;
          days: number;
          employee_id: string;
          end_date: string;
          id: string;
          reason: string | null;
          start_date: string;
          status: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          days?: number;
          employee_id: string;
          end_date: string;
          id?: string;
          reason?: string | null;
          start_date: string;
          status?: string;
          type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          days?: number;
          employee_id?: string;
          end_date?: string;
          id?: string;
          reason?: string | null;
          start_date?: string;
          status?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      loyalty_transactions: {
        Row: {
          created_at: string;
          customer_id: string;
          id: string;
          notes: string | null;
          occurred_at: string;
          points: number;
          reference: string | null;
          sale_id: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          points?: number;
          reference?: string | null;
          sale_id?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          points?: number;
          reference?: string | null;
          sale_id?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          is_read: boolean;
          link: string | null;
          message: string | null;
          metadata: Json;
          severity: string;
          title: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          message?: string | null;
          metadata?: Json;
          severity?: string;
          title: string;
          type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          message?: string | null;
          metadata?: Json;
          severity?: string;
          title?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payroll_runs: {
        Row: {
          allowances: number;
          basic_salary: number;
          created_at: string;
          employee_id: string;
          gross_pay: number;
          id: string;
          month: string;
          net_pay: number;
          notes: string | null;
          other_deductions: number;
          ssnit: number;
          status: string;
          tax: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          allowances?: number;
          basic_salary?: number;
          created_at?: string;
          employee_id: string;
          gross_pay?: number;
          id?: string;
          month: string;
          net_pay?: number;
          notes?: string | null;
          other_deductions?: number;
          ssnit?: number;
          status?: string;
          tax?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          allowances?: number;
          basic_salary?: number;
          created_at?: string;
          employee_id?: string;
          gross_pay?: number;
          id?: string;
          month?: string;
          net_pay?: number;
          notes?: string | null;
          other_deductions?: number;
          ssnit?: number;
          status?: string;
          tax?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_runs_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      pos_connections: {
        Row: {
          address: string | null;
          branch_id: string | null;
          config: Json | null;
          created_at: string;
          device_type: string | null;
          id: string;
          last_connected_at: string | null;
          name: string;
          port: number | null;
          status: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          branch_id?: string | null;
          config?: Json | null;
          created_at?: string;
          device_type?: string | null;
          id?: string;
          last_connected_at?: string | null;
          name: string;
          port?: number | null;
          status?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          branch_id?: string | null;
          config?: Json | null;
          created_at?: string;
          device_type?: string | null;
          id?: string;
          last_connected_at?: string | null;
          name?: string;
          port?: number | null;
          status?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      price_list_items: {
        Row: {
          created_at: string;
          id: string;
          price: number;
          price_list_id: string;
          product_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          price?: number;
          price_list_id: string;
          product_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          price?: number;
          price_list_id?: string;
          product_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey";
            columns: ["price_list_id"];
            isOneToOne: false;
            referencedRelation: "price_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      price_lists: {
        Row: {
          created_at: string;
          currency: string | null;
          description: string | null;
          discount_value: number;
          id: string;
          is_active: boolean | null;
          is_default: boolean;
          name: string;
          type: string;
          updated_at: string;
          user_id: string;
          valid_from: string | null;
          valid_to: string | null;
        };
        Insert: {
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          discount_value?: number;
          id?: string;
          is_active?: boolean | null;
          is_default?: boolean;
          name: string;
          type?: string;
          updated_at?: string;
          user_id: string;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          discount_value?: number;
          id?: string;
          is_active?: boolean | null;
          is_default?: boolean;
          name?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_import_batches: {
        Row: {
          created_at: string;
          error_count: number;
          filename: string | null;
          id: string;
          import_mode: string;
          imported_by_name: string | null;
          imported_count: number;
          overwrite_fields: Json | null;
          pending_rows: Json | null;
          snapshot: Json | null;
          status: string;
          total_rows: number;
          updated_at: string;
          updated_count: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error_count?: number;
          filename?: string | null;
          id?: string;
          import_mode?: string;
          imported_by_name?: string | null;
          imported_count?: number;
          overwrite_fields?: Json | null;
          pending_rows?: Json | null;
          snapshot?: Json | null;
          status?: string;
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error_count?: number;
          filename?: string | null;
          id?: string;
          import_mode?: string;
          imported_by_name?: string | null;
          imported_count?: number;
          overwrite_fields?: Json | null;
          pending_rows?: Json | null;
          snapshot?: Json | null;
          status?: string;
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      product_transfers: {
        Row: {
          created_at: string;
          from_branch_id: string | null;
          from_warehouse_id: string | null;
          id: string;
          items: Json | null;
          notes: string | null;
          reference: string | null;
          status: string | null;
          to_branch_id: string | null;
          to_warehouse_id: string | null;
          transferred_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          from_branch_id?: string | null;
          from_warehouse_id?: string | null;
          id?: string;
          items?: Json | null;
          notes?: string | null;
          reference?: string | null;
          status?: string | null;
          to_branch_id?: string | null;
          to_warehouse_id?: string | null;
          transferred_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          from_branch_id?: string | null;
          from_warehouse_id?: string | null;
          id?: string;
          items?: Json | null;
          notes?: string | null;
          reference?: string | null;
          status?: string | null;
          to_branch_id?: string | null;
          to_warehouse_id?: string | null;
          transferred_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          attributes: Json | null;
          barcode: string | null;
          batch_lot_number: string | null;
          branch_id: string | null;
          brand: string | null;
          category: string | null;
          category_id: string;
          cost: number | null;
          created_at: string;
          description: string | null;
          expiry_date: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean | null;
          name: string;
          price: number | null;
          reorder_level: number | null;
          sku: string | null;
          stock: number | null;
          tax_rate: number | null;
          unit: string | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          attributes?: Json | null;
          barcode?: string | null;
          batch_lot_number?: string | null;
          branch_id?: string | null;
          brand?: string | null;
          category?: string | null;
          category_id: string;
          cost?: number | null;
          created_at?: string;
          description?: string | null;
          expiry_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          name: string;
          price?: number | null;
          reorder_level?: number | null;
          sku?: string | null;
          stock?: number | null;
          tax_rate?: number | null;
          unit?: string | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          attributes?: Json | null;
          barcode?: string | null;
          batch_lot_number?: string | null;
          branch_id?: string | null;
          brand?: string | null;
          category?: string | null;
          category_id?: string;
          cost?: number | null;
          created_at?: string;
          description?: string | null;
          expiry_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          name?: string;
          price?: number | null;
          reorder_level?: number | null;
          sku?: string | null;
          stock?: number | null;
          tax_rate?: number | null;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          auth_id: string;
          created_at: string;
          email: string;
          id: number;
          is_locked: boolean;
          must_change_password: boolean;
          name: string;
          two_factor_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          auth_id: string;
          created_at?: string;
          email: string;
          id?: number;
          is_locked?: boolean;
          must_change_password?: boolean;
          name?: string;
          two_factor_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          auth_id?: string;
          created_at?: string;
          email?: string;
          id?: number;
          is_locked?: boolean;
          must_change_password?: boolean;
          name?: string;
          two_factor_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          assigned_to: string | null;
          budget: number | null;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          name: string;
          priority: string;
          start_date: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assigned_to?: string | null;
          budget?: number | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name: string;
          priority?: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          assigned_to?: string | null;
          budget?: number | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name?: string;
          priority?: string;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
          applies_to: Json | null;
          code: string | null;
          created_at: string;
          ends_at: string | null;
          id: string;
          is_active: boolean | null;
          min_purchase: number | null;
          name: string;
          starts_at: string | null;
          type: string | null;
          updated_at: string;
          usage_limit: number | null;
          used_count: number | null;
          user_id: string;
          value: number | null;
        };
        Insert: {
          applies_to?: Json | null;
          code?: string | null;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          min_purchase?: number | null;
          name: string;
          starts_at?: string | null;
          type?: string | null;
          updated_at?: string;
          usage_limit?: number | null;
          used_count?: number | null;
          user_id: string;
          value?: number | null;
        };
        Update: {
          applies_to?: Json | null;
          code?: string | null;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          min_purchase?: number | null;
          name?: string;
          starts_at?: string | null;
          type?: string | null;
          updated_at?: string;
          usage_limit?: number | null;
          used_count?: number | null;
          user_id?: string;
          value?: number | null;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          branch_id: string | null;
          created_at: string;
          discount: number | null;
          expected_date: string | null;
          id: string;
          items: Json | null;
          notes: string | null;
          ordered_at: string | null;
          received_date: string | null;
          reference: string | null;
          status: string | null;
          subtotal: number | null;
          supplier_id: string | null;
          supplier_name: string | null;
          tax: number | null;
          total: number | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          discount?: number | null;
          expected_date?: string | null;
          id?: string;
          items?: Json | null;
          notes?: string | null;
          ordered_at?: string | null;
          received_date?: string | null;
          reference?: string | null;
          status?: string | null;
          subtotal?: number | null;
          supplier_id?: string | null;
          supplier_name?: string | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          discount?: number | null;
          expected_date?: string | null;
          id?: string;
          items?: Json | null;
          notes?: string | null;
          ordered_at?: string | null;
          received_date?: string | null;
          reference?: string | null;
          status?: string | null;
          subtotal?: number | null;
          supplier_id?: string | null;
          supplier_name?: string | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [];
      };
      purchase_return_items: {
        Row: {
          batch_id: string | null;
          category_id: string | null;
          category_name: string | null;
          created_at: string;
          discount_amount: number;
          expiry_date: string | null;
          id: string;
          item_condition: string;
          line_total: number;
          notes: string | null;
          other_explanation: string | null;
          product_id: string;
          product_name: string;
          purchase_return_id: string;
          quantity_previously_returned: number;
          quantity_purchased: number;
          quantity_returned: number;
          reason: string;
          serial_numbers: Json;
          sku: string | null;
          tax_amount: number;
          tax_rate: number;
          unit_cost: number;
          updated_at: string;
          variant_id: string | null;
          warehouse_id: string | null;
        };
        Insert: {
          batch_id?: string | null;
          category_id?: string | null;
          category_name?: string | null;
          created_at?: string;
          discount_amount?: number;
          expiry_date?: string | null;
          id?: string;
          item_condition: string;
          line_total?: number;
          notes?: string | null;
          other_explanation?: string | null;
          product_id: string;
          product_name: string;
          purchase_return_id: string;
          quantity_previously_returned?: number;
          quantity_purchased: number;
          quantity_returned: number;
          reason: string;
          serial_numbers?: Json;
          sku?: string | null;
          tax_amount?: number;
          tax_rate?: number;
          unit_cost?: number;
          updated_at?: string;
          variant_id?: string | null;
          warehouse_id?: string | null;
        };
        Update: {
          batch_id?: string | null;
          category_id?: string | null;
          category_name?: string | null;
          created_at?: string;
          discount_amount?: number;
          expiry_date?: string | null;
          id?: string;
          item_condition?: string;
          line_total?: number;
          notes?: string | null;
          other_explanation?: string | null;
          product_id?: string;
          product_name?: string;
          purchase_return_id?: string;
          quantity_previously_returned?: number;
          quantity_purchased?: number;
          quantity_returned?: number;
          reason?: string;
          serial_numbers?: Json;
          sku?: string | null;
          tax_amount?: number;
          tax_rate?: number;
          unit_cost?: number;
          updated_at?: string;
          variant_id?: string | null;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_return_items_purchase_return_id_fkey";
            columns: ["purchase_return_id"];
            isOneToOne: false;
            referencedRelation: "purchase_returns";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_return_settlements: {
        Row: {
          account_id: string | null;
          amount: number;
          created_at: string;
          created_by: string;
          id: string;
          notes: string | null;
          payment_method: string | null;
          purchase_return_id: string;
          reversed_at: string | null;
          reversed_by: string | null;
          settlement_date: string;
          settlement_type: string;
          status: string;
          transaction_reference: string | null;
        };
        Insert: {
          account_id?: string | null;
          amount: number;
          created_at?: string;
          created_by: string;
          id?: string;
          notes?: string | null;
          payment_method?: string | null;
          purchase_return_id: string;
          reversed_at?: string | null;
          reversed_by?: string | null;
          settlement_date?: string;
          settlement_type: string;
          status?: string;
          transaction_reference?: string | null;
        };
        Update: {
          account_id?: string | null;
          amount?: number;
          created_at?: string;
          created_by?: string;
          id?: string;
          notes?: string | null;
          payment_method?: string | null;
          purchase_return_id?: string;
          reversed_at?: string | null;
          reversed_by?: string | null;
          settlement_date?: string;
          settlement_type?: string;
          status?: string;
          transaction_reference?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_return_settlements_purchase_return_id_fkey";
            columns: ["purchase_return_id"];
            isOneToOne: false;
            referencedRelation: "purchase_returns";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_returns: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string | null;
          credited_amount: number;
          debit_note_number: string | null;
          discount_amount: number;
          id: string;
          items: Json;
          notes: string | null;
          outstanding_amount: number;
          purchase_order_id: string | null;
          reason: string | null;
          reason_summary: string | null;
          reference: string | null;
          refunded_amount: number;
          return_number: string | null;
          returned_at: string;
          reversal_of: string | null;
          reversal_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          settlement_type: string;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          subtotal: number;
          supplier_id: number | null;
          supplier_reference: string | null;
          tax: number;
          tax_amount: number;
          total: number;
          total_amount: number;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          credited_amount?: number;
          debit_note_number?: string | null;
          discount_amount?: number;
          id?: string;
          items?: Json;
          notes?: string | null;
          outstanding_amount?: number;
          purchase_order_id?: string | null;
          reason?: string | null;
          reason_summary?: string | null;
          reference?: string | null;
          refunded_amount?: number;
          return_number?: string | null;
          returned_at?: string;
          reversal_of?: string | null;
          reversal_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          settlement_type?: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          subtotal?: number;
          supplier_id?: number | null;
          supplier_reference?: string | null;
          tax?: number;
          tax_amount?: number;
          total?: number;
          total_amount?: number;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          credited_amount?: number;
          debit_note_number?: string | null;
          discount_amount?: number;
          id?: string;
          items?: Json;
          notes?: string | null;
          outstanding_amount?: number;
          purchase_order_id?: string | null;
          reason?: string | null;
          reason_summary?: string | null;
          reference?: string | null;
          refunded_amount?: number;
          return_number?: string | null;
          returned_at?: string;
          reversal_of?: string | null;
          reversal_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          settlement_type?: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          subtotal?: number;
          supplier_id?: number | null;
          supplier_reference?: string | null;
          tax?: number;
          tax_amount?: number;
          total?: number;
          total_amount?: number;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_returns_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_returns_reversal_of_fkey";
            columns: ["reversal_of"];
            isOneToOne: false;
            referencedRelation: "purchase_returns";
            referencedColumns: ["id"];
          },
        ];
      };
      quotations: {
        Row: {
          created_at: string;
          customer_id: string | null;
          discount: number | null;
          id: string;
          items: Json | null;
          notes: string | null;
          reference: string | null;
          status: string | null;
          subtotal: number | null;
          tax: number | null;
          total: number | null;
          updated_at: string;
          user_id: string;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          discount?: number | null;
          id?: string;
          items?: Json | null;
          notes?: string | null;
          reference?: string | null;
          status?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id: string;
          valid_until?: string | null;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          discount?: number | null;
          id?: string;
          items?: Json | null;
          notes?: string | null;
          reference?: string | null;
          status?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      recycle_bin: {
        Row: {
          deleted_at: string;
          deleted_by_id: string | null;
          deleted_by_name: string | null;
          entity_data: Json;
          entity_id: string;
          entity_name: string | null;
          entity_type: string;
          id: number;
          user_id: string;
        };
        Insert: {
          deleted_at?: string;
          deleted_by_id?: string | null;
          deleted_by_name?: string | null;
          entity_data?: Json;
          entity_id: string;
          entity_name?: string | null;
          entity_type: string;
          id?: number;
          user_id: string;
        };
        Update: {
          deleted_at?: string;
          deleted_by_id?: string | null;
          deleted_by_name?: string | null;
          entity_data?: Json;
          entity_id?: string;
          entity_name?: string | null;
          entity_type?: string;
          id?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      reorder_rules: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean | null;
          max_quantity: number | null;
          min_quantity: number | null;
          product_id: string | null;
          reorder_quantity: number | null;
          supplier_id: string | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          max_quantity?: number | null;
          min_quantity?: number | null;
          product_id?: string | null;
          reorder_quantity?: number | null;
          supplier_id?: string | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          max_quantity?: number | null;
          min_quantity?: number | null;
          product_id?: string | null;
          reorder_quantity?: number | null;
          supplier_id?: string | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reorder_rules_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      restore_history: {
        Row: {
          created_at: string;
          filename: string | null;
          id: number;
          notes: string | null;
          rows_restored: number;
          status: string;
          tables_restored: string[];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filename?: string | null;
          id?: number;
          notes?: string | null;
          rows_restored?: number;
          status?: string;
          tables_restored?: string[];
          user_id: string;
        };
        Update: {
          created_at?: string;
          filename?: string | null;
          id?: number;
          notes?: string | null;
          rows_restored?: number;
          status?: string;
          tables_restored?: string[];
          user_id?: string;
        };
        Relationships: [];
      };
      sale_lines: {
        Row: {
          barcode: string | null;
          batch_number: string | null;
          branch_id: string | null;
          brand: string | null;
          category_id: string | null;
          category_name: string | null;
          cogs_amount: number | null;
          created_at: string;
          discount_amount: number | null;
          expiry_date: string | null;
          gross_amount: number | null;
          id: string;
          known_fields: Json;
          line_number: number;
          pricing_snapshot: Json;
          product_id: string | null;
          product_name: string | null;
          product_snapshot: Json;
          promotion_snapshot: Json | null;
          quantity: number | null;
          sale_id: string;
          serial_numbers: Json | null;
          sku: string | null;
          snapshot_completeness: string;
          sold_at: string;
          source_payload: Json;
          tax_amount: number | null;
          tax_rate: number | null;
          total_amount: number | null;
          unit: string | null;
          unit_cost: number | null;
          unit_price: number | null;
          warehouse_id: string | null;
        };
        Insert: {
          barcode?: string | null;
          batch_number?: string | null;
          branch_id?: string | null;
          brand?: string | null;
          category_id?: string | null;
          category_name?: string | null;
          cogs_amount?: number | null;
          created_at?: string;
          discount_amount?: number | null;
          expiry_date?: string | null;
          gross_amount?: number | null;
          id: string;
          known_fields?: Json;
          line_number: number;
          pricing_snapshot?: Json;
          product_id?: string | null;
          product_name?: string | null;
          product_snapshot?: Json;
          promotion_snapshot?: Json | null;
          quantity?: number | null;
          sale_id: string;
          serial_numbers?: Json | null;
          sku?: string | null;
          snapshot_completeness: string;
          sold_at: string;
          source_payload?: Json;
          tax_amount?: number | null;
          tax_rate?: number | null;
          total_amount?: number | null;
          unit?: string | null;
          unit_cost?: number | null;
          unit_price?: number | null;
          warehouse_id?: string | null;
        };
        Update: {
          barcode?: string | null;
          batch_number?: string | null;
          branch_id?: string | null;
          brand?: string | null;
          category_id?: string | null;
          category_name?: string | null;
          cogs_amount?: number | null;
          created_at?: string;
          discount_amount?: number | null;
          expiry_date?: string | null;
          gross_amount?: number | null;
          id?: string;
          known_fields?: Json;
          line_number?: number;
          pricing_snapshot?: Json;
          product_id?: string | null;
          product_name?: string | null;
          product_snapshot?: Json;
          promotion_snapshot?: Json | null;
          quantity?: number | null;
          sale_id?: string;
          serial_numbers?: Json | null;
          sku?: string | null;
          snapshot_completeness?: string;
          sold_at?: string;
          source_payload?: Json;
          tax_amount?: number | null;
          tax_rate?: number | null;
          total_amount?: number | null;
          unit?: string | null;
          unit_cost?: number | null;
          unit_price?: number | null;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sale_lines_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          branch_id: string | null;
          cash_session_id: string | null;
          change_due: number | null;
          channel: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          discount: number | null;
          effects_mode: string;
          effects_posted_at: string | null;
          engine_created_at: string;
          id: string;
          idempotency_key: string;
          items: Json | null;
          notes: string | null;
          paid: number | null;
          payment_method: string | null;
          payment_status: string | null;
          reference: string | null;
          return_eligible: boolean;
          snapshot_completeness: string;
          snapshot_version: number;
          sold_at: string;
          source_system: string;
          status: string | null;
          subtotal: number | null;
          tax: number | null;
          total: number | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          branch_id?: string | null;
          cash_session_id?: string | null;
          change_due?: number | null;
          channel?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          discount?: number | null;
          effects_mode?: string;
          effects_posted_at?: string | null;
          engine_created_at?: string;
          id?: string;
          idempotency_key?: string;
          items?: Json | null;
          notes?: string | null;
          paid?: number | null;
          payment_method?: string | null;
          payment_status?: string | null;
          reference?: string | null;
          return_eligible?: boolean;
          snapshot_completeness?: string;
          snapshot_version?: number;
          sold_at?: string;
          source_system?: string;
          status?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          branch_id?: string | null;
          cash_session_id?: string | null;
          change_due?: number | null;
          channel?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          discount?: number | null;
          effects_mode?: string;
          effects_posted_at?: string | null;
          engine_created_at?: string;
          id?: string;
          idempotency_key?: string;
          items?: Json | null;
          notes?: string | null;
          paid?: number | null;
          payment_method?: string | null;
          payment_status?: string | null;
          reference?: string | null;
          return_eligible?: boolean;
          snapshot_completeness?: string;
          snapshot_version?: number;
          sold_at?: string;
          source_system?: string;
          status?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [];
      };
      sales_returns: {
        Row: {
          created_at: string;
          customer_id: number | null;
          id: string;
          items: Json;
          notes: string | null;
          reason: string | null;
          reference: string | null;
          refund_method: string | null;
          returned_at: string;
          sale_id: string | null;
          status: string;
          subtotal: number;
          tax: number;
          total: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id?: number | null;
          id?: string;
          items?: Json;
          notes?: string | null;
          reason?: string | null;
          reference?: string | null;
          refund_method?: string | null;
          returned_at?: string;
          sale_id?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: number | null;
          id?: string;
          items?: Json;
          notes?: string | null;
          reason?: string | null;
          reference?: string | null;
          refund_method?: string | null;
          returned_at?: string;
          sale_id?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_returns_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      serial_numbers: {
        Row: {
          branch_id: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          product_id: string | null;
          serial: string;
          status: string | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          serial: string;
          status?: string | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          serial?: string;
          status?: string | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "serial_numbers_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_adjustments: {
        Row: {
          adjusted_at: string | null;
          branch_id: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          product_id: string | null;
          quantity: number;
          reason: string | null;
          reference: string | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          adjusted_at?: string | null;
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          quantity?: number;
          reason?: string | null;
          reference?: string | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          adjusted_at?: string | null;
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          quantity?: number;
          reason?: string | null;
          reference?: string | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          balance_after: number;
          created_at: string;
          created_by: string | null;
          id: string;
          movement_type: string;
          product_id: string;
          quantity: number;
          reason: string | null;
          reference_id: string | null;
          reference_type: string | null;
          unit_cost: number | null;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          balance_after?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_type: string;
          product_id: string;
          quantity: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          unit_cost?: number | null;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          balance_after?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_type?: string;
          product_id?: string;
          quantity?: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          unit_cost?: number | null;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_take_items: {
        Row: {
          counted: number | null;
          created_at: string;
          expected: number | null;
          id: string;
          notes: string | null;
          product_id: string | null;
          stock_take_id: string;
          user_id: string;
          variance: number | null;
        };
        Insert: {
          counted?: number | null;
          created_at?: string;
          expected?: number | null;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          stock_take_id: string;
          user_id: string;
          variance?: number | null;
        };
        Update: {
          counted?: number | null;
          created_at?: string;
          expected?: number | null;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          stock_take_id?: string;
          user_id?: string;
          variance?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_take_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_take_items_stock_take_id_fkey";
            columns: ["stock_take_id"];
            isOneToOne: false;
            referencedRelation: "stock_takes";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_takes: {
        Row: {
          branch_id: string | null;
          counted_at: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          reference: string | null;
          status: string | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          branch_id?: string | null;
          counted_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          reference?: string | null;
          status?: string | null;
          updated_at?: string;
          user_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          branch_id?: string | null;
          counted_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          reference?: string | null;
          status?: string | null;
          updated_at?: string;
          user_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [];
      };
      supplier_invoices: {
        Row: {
          created_at: string;
          due_date: string | null;
          id: string;
          invoiced_at: string | null;
          items: Json | null;
          notes: string | null;
          paid: number | null;
          payment_date: string | null;
          payment_method: string | null;
          payment_reference: string | null;
          po_number: string | null;
          purchase_order_id: string | null;
          reference: string | null;
          status: string | null;
          subtotal: number | null;
          supplier_id: string | null;
          supplier_name: string | null;
          tax: number | null;
          total: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          due_date?: string | null;
          id?: string;
          invoiced_at?: string | null;
          items?: Json | null;
          notes?: string | null;
          paid?: number | null;
          payment_date?: string | null;
          payment_method?: string | null;
          payment_reference?: string | null;
          po_number?: string | null;
          purchase_order_id?: string | null;
          reference?: string | null;
          status?: string | null;
          subtotal?: number | null;
          supplier_id?: string | null;
          supplier_name?: string | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          due_date?: string | null;
          id?: string;
          invoiced_at?: string | null;
          items?: Json | null;
          notes?: string | null;
          paid?: number | null;
          payment_date?: string | null;
          payment_method?: string | null;
          payment_reference?: string | null;
          po_number?: string | null;
          purchase_order_id?: string | null;
          reference?: string | null;
          status?: string | null;
          subtotal?: number | null;
          supplier_id?: string | null;
          supplier_name?: string | null;
          tax?: number | null;
          total?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          address: string | null;
          city: string | null;
          contact_person: string | null;
          created_at: string;
          email: string | null;
          id: number;
          is_active: boolean;
          name: string;
          notes: string | null;
          payment_terms: string | null;
          phone: string | null;
          tax_id: string | null;
          updated_at: string;
          user_id: string;
          uuid_id: string;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          contact_person?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          payment_terms?: string | null;
          phone?: string | null;
          tax_id?: string | null;
          updated_at?: string;
          user_id: string;
          uuid_id?: string;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          contact_person?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          is_active?: boolean;
          name?: string;
          notes?: string | null;
          payment_terms?: string | null;
          phone?: string | null;
          tax_id?: string | null;
          updated_at?: string;
          user_id?: string;
          uuid_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          assigned_to: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          priority: string;
          project_id: string;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assigned_to?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          priority?: string;
          project_id: string;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          assigned_to?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          priority?: string;
          project_id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          created_at: string;
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      user_sessions: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          ip: string | null;
          last_seen: string;
          login_at: string;
          profile_name: string | null;
          role: string | null;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          ip?: string | null;
          last_seen?: string;
          login_at?: string;
          profile_name?: string | null;
          role?: string | null;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          ip?: string | null;
          last_seen?: string;
          login_at?: string;
          profile_name?: string | null;
          role?: string | null;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_tax_rates: {
        Row: {
          covid_levy: number;
          created_at: string;
          getfund_rate: number;
          id: string;
          nhil_rate: number;
          updated_at: string;
          user_id: string;
          vat_rate: number;
        };
        Insert: {
          covid_levy?: number;
          created_at?: string;
          getfund_rate?: number;
          id?: string;
          nhil_rate?: number;
          updated_at?: string;
          user_id: string;
          vat_rate?: number;
        };
        Update: {
          covid_levy?: number;
          created_at?: string;
          getfund_rate?: number;
          id?: string;
          nhil_rate?: number;
          updated_at?: string;
          user_id?: string;
          vat_rate?: number;
        };
        Relationships: [];
      };
      warehouses: {
        Row: {
          address: string | null;
          branch_id: number | null;
          code: string | null;
          created_at: string;
          id: number;
          is_active: boolean;
          is_default: boolean;
          location: string | null;
          name: string;
          updated_at: string;
          user_id: string;
          uuid_id: string;
        };
        Insert: {
          address?: string | null;
          branch_id?: number | null;
          code?: string | null;
          created_at?: string;
          id?: number;
          is_active?: boolean;
          is_default?: boolean;
          location?: string | null;
          name: string;
          updated_at?: string;
          user_id: string;
          uuid_id?: string;
        };
        Update: {
          address?: string | null;
          branch_id?: number | null;
          code?: string | null;
          created_at?: string;
          id?: number;
          is_active?: boolean;
          is_default?: boolean;
          location?: string | null;
          name?: string;
          updated_at?: string;
          user_id?: string;
          uuid_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      complete_purchase_return: {
        Args: { p_actor: string; p_return_id: string };
        Returns: {
          approved_at: string | null;
          approved_by: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string | null;
          credited_amount: number;
          debit_note_number: string | null;
          discount_amount: number;
          id: string;
          items: Json;
          notes: string | null;
          outstanding_amount: number;
          purchase_order_id: string | null;
          reason: string | null;
          reason_summary: string | null;
          reference: string | null;
          refunded_amount: number;
          return_number: string | null;
          returned_at: string;
          reversal_of: string | null;
          reversal_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          settlement_type: string;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          subtotal: number;
          supplier_id: number | null;
          supplier_reference: string | null;
          tax: number;
          tax_amount: number;
          total: number;
          total_amount: number;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "purchase_returns";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_sale_atomic: {
        Args: { p_actor: string; p_lines: Json; p_sale: Json };
        Returns: {
          branch_id: string | null;
          cash_session_id: string | null;
          change_due: number | null;
          channel: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          discount: number | null;
          effects_mode: string;
          effects_posted_at: string | null;
          engine_created_at: string;
          id: string;
          idempotency_key: string;
          items: Json | null;
          notes: string | null;
          paid: number | null;
          payment_method: string | null;
          payment_status: string | null;
          reference: string | null;
          return_eligible: boolean;
          snapshot_completeness: string;
          snapshot_version: number;
          sold_at: string;
          source_system: string;
          status: string | null;
          subtotal: number | null;
          tax: number | null;
          total: number | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "sales";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      next_purchase_return_number: { Args: never; Returns: string };
      normalize_restored_jsonb: {
        Args: {
          p_default?: Json;
          p_expected_type: string;
          p_field_name: string;
          p_value: Json;
        };
        Returns: Json;
      };
      post_stock_movement: {
        Args: {
          p_allow_negative?: boolean;
          p_product: string;
          p_qty: number;
          p_reason: string;
          p_ref_id: string;
          p_ref_type: string;
          p_type: string;
          p_unit_cost: number;
          p_user: string;
        };
        Returns: {
          balance_after: number;
          created_at: string;
          created_by: string | null;
          id: string;
          movement_type: string;
          product_id: string;
          quantity: number;
          reason: string | null;
          reference_id: string | null;
          reference_type: string | null;
          unit_cost: number | null;
          user_id: string;
          warehouse_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "stock_movements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      purge_smoke_test_sales: {
        Args: { p_actor: string; p_marker?: string };
        Returns: number;
      };
      restore_canonical_sale: {
        Args: { p_actor: string; p_lines: Json; p_sale: Json };
        Returns: {
          branch_id: string | null;
          cash_session_id: string | null;
          change_due: number | null;
          channel: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          discount: number | null;
          effects_mode: string;
          effects_posted_at: string | null;
          engine_created_at: string;
          id: string;
          idempotency_key: string;
          items: Json | null;
          notes: string | null;
          paid: number | null;
          payment_method: string | null;
          payment_status: string | null;
          reference: string | null;
          return_eligible: boolean;
          snapshot_completeness: string;
          snapshot_version: number;
          sold_at: string;
          source_system: string;
          status: string | null;
          subtotal: number | null;
          tax: number | null;
          total: number | null;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "sales";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reverse_purchase_return: {
        Args: { p_actor: string; p_reason: string; p_return_id: string };
        Returns: {
          approved_at: string | null;
          approved_by: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string | null;
          credited_amount: number;
          debit_note_number: string | null;
          discount_amount: number;
          id: string;
          items: Json;
          notes: string | null;
          outstanding_amount: number;
          purchase_order_id: string | null;
          reason: string | null;
          reason_summary: string | null;
          reference: string | null;
          refunded_amount: number;
          return_number: string | null;
          returned_at: string;
          reversal_of: string | null;
          reversal_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          settlement_type: string;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          subtotal: number;
          supplier_id: number | null;
          supplier_reference: string | null;
          tax: number;
          tax_amount: number;
          total: number;
          total_amount: number;
          updated_at: string;
          user_id: string;
          warehouse_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "purchase_returns";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      app_role: "admin" | "manager" | "cashier" | "accountant" | "user";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "cashier", "accountant", "user"],
    },
  },
} as const;
