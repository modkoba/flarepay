/** FlarePay auth page — Supabase email/password signup + login. */

import { supabase } from "./supabase.js";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
let mode: "login" | "signup" = "login";

if (!supabase) {
  $("#authErr").textContent = "Platform mode is not configured (VITE_SUPABASE_URL missing) — the dashboard runs in local API-key mode instead.";
  ($("#submitBtn") as HTMLButtonElement).disabled = true;
}

$("#toggleLink").addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  $("#authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("#authHint").textContent =
    mode === "login" ? "Sign in to your merchant dashboard." : "Accept XRP with proof-settled payouts in minutes.";
  $("#submitBtn").textContent = mode === "login" ? "Sign in" : "Sign up";
  $("#toggleLine").firstChild!.textContent = mode === "login" ? "New merchant? " : "Already have an account? ";
  $("#toggleLink").textContent = mode === "login" ? "Create an account" : "Sign in";
});

$("#demoCred").addEventListener("click", () => {
  ($("#email") as HTMLInputElement).value = "demo@flarepay.dev";
  ($("#password") as HTMLInputElement).value = "flarepay-demo-2026";
});

$("#submitBtn").addEventListener("click", async () => {
  if (!supabase) return;
  const email = ($("#email") as HTMLInputElement).value.trim();
  const password = ($("#password") as HTMLInputElement).value;
  if (!email || password.length < 8) {
    $("#authErr").textContent = "email + password (min 8 chars) required";
    return;
  }
  const btn = $("#submitBtn") as HTMLButtonElement;
  btn.disabled = true;
  $("#authErr").textContent = "";
  try {
    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) throw error;
    location.href = "/dashboard.html";
  } catch (err) {
    $("#authErr").textContent = (err as Error).message;
    btn.disabled = false;
  }
});
