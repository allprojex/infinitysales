const LOGIN_TIME_KEY = "infinity_si_login_at";

export function getLoginTime(): number {
  const stored = sessionStorage.getItem(LOGIN_TIME_KEY);
  return stored ? parseInt(stored, 10) : Date.now();
}

export function setLoginTime(): void {
  sessionStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
}

export function clearLoginTime(): void {
  sessionStorage.removeItem(LOGIN_TIME_KEY);
}
