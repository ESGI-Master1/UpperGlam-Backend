import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import env from '#start/env'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'passwordHash',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column({ columnName: 'password_hash', serializeAs: null })
  declare passwordHash: string

  @column()
  declare phone: string | null

  @column()
  declare status: 'pending' | 'active' | 'suspended'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: env.get('ACCESS_TOKEN_EXPIRES_IN'),
  })
}
