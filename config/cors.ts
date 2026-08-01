import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

const allowedOrigins = (env.get('CORS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function getAllowedOrigin() {
  if (allowedOrigins.length > 0) {
    return allowedOrigins
  }

  return env.get('NODE_ENV') === 'production' ? false : true
}

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  enabled: true,
  origin: getAllowedOrigin(),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
