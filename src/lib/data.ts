import { supabase } from './supabase';

export interface BillRow { id: string; label: string; period_start: string; period_end: string; kwh: number; amount: number }
export interface ApplianceRow { id: string; name: string; watts: number; hours_per_day: number }

export async function listBills(): Promise<BillRow[]> {
  const { data, error } = await supabase.from('bills').select('*').order('period_start', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, kwh: Number(r.kwh), amount: Number(r.amount) }));
}

export async function listAppliances(): Promise<ApplianceRow[]> {
  const { data, error } = await supabase.from('appliances').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, watts: Number(r.watts), hours_per_day: Number(r.hours_per_day) }));
}

export interface GoalRow { id: string; appliance_id: string; target_hours: number }
export interface CheckinRow { id: string; goal_id: string; day: string }

export async function listGoals(): Promise<GoalRow[]> {
  const { data, error } = await supabase.from('goals').select('id, appliance_id, target_hours');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, target_hours: Number(r.target_hours) }));
}

export async function listCheckins(): Promise<CheckinRow[]> {
  const { data, error } = await supabase.from('goal_checkins').select('id, goal_id, day');
  if (error) throw new Error(error.message);
  return data ?? [];
}
