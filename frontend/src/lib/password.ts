export const passwordPolicyMessage =
  "Пароль должен быть не короче 6 символов и содержать хотя бы одну букву и одну цифру.";

export function isPasswordPolicyValid(password: string) {
  return password.length >= 6 && /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);
}
