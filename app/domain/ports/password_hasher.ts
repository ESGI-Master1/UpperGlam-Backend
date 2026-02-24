export interface PasswordHasher {
  make(value: string): Promise<string>
}
