import type { PreRegisterUserResult } from '#application/useCases/pre_register_user_use_case'

export function presentPreRegistrationResult(result: PreRegisterUserResult) {
  return {
    data: result,
  }
}
