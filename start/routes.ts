/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const PreRegistrationsController = () =>
  import('#infrastructure/http/controllers/pre_registrations_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.post('/auth/register', [AuthController, 'register'])
router.post('/auth/login', [AuthController, 'login'])
router.post('/pre-registration', [PreRegistrationsController, 'store'])

router
  .group(() => {
    router.get('/auth/me', [AuthController, 'me'])
    router.post('/auth/logout', [AuthController, 'logout'])
  })
  .use(middleware.auth({
    guards: ['api'],
  }))
