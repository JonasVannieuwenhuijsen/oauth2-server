import OAuth2Server, {AuthorizationCode, Falsey, OAuthError, RefreshToken, User} from '@node-oauth/oauth2-server'
import { AzureADGrantType } from './grants/AzureADGrantType'
import { Client, OAuth2ServerOptions, Token } from './types'
import {generateAuthorizationCodeModel} from "./AuthorizationCodeModel";

export function createOAuth2 (options: OAuth2ServerOptions, ): OAuth2Server {
  const codeModel = generateAuthorizationCodeModel(options.services.codeService)
  const serverOptions: OAuth2Server.ServerOptions = {
    model: {
      getClient: async (clientId: string, secret: string) => {
        return await options.services.clientService.getClient(clientId, secret)
      },
      getUserFromClient: async (client: Client) => {
        return await options.services.clientService.getUserFromClient(client)
      },
      getUser: async (username, password) => {
        return await options.services.userService.verify(username, password)
      },
      generateAccessToken: async (client: Client, user, scope) => {
        return await options.services.tokenService.generateAccessToken(client, user, scope)
      },
      generateRefreshToken: async (client: Client, user, scope) => {
        return await options.services.tokenService.generateRefreshToken(client, user, scope)
      },
      getAccessToken: async (accessToken) => {
        return await options.services.tokenService.getAccessToken(accessToken)
      },
      getRefreshToken: async (refreshToken) => {
        return await options.services.tokenService.getRefreshToken(refreshToken)
      },
      revokeToken: async (token: RefreshToken | Token) => {
        return await options.services.tokenService.revokeToken(token)
      },
      saveToken: async (token: Token, client: Client, user: User): Promise<Token> => {
        token.client = client
        token.user = user

        if (token.refreshToken != null) {
          await options.services.tokenService.saveRefreshToken(token.refreshToken)
        }

        return token
      },
      verifyScope: async (token: Token, scope: string | string[]): Promise<boolean> => {
        if (token.scope === null || token.scope === undefined) {
          return false
        }

        if (typeof scope === 'string') {
          scope = scope.split(' ')
        }

        return scope.every(s => token.scope.includes(s))
      },
      validateScope: async (
        _user: User, client: Client, scope: string | string[]
      ): Promise<string[]> => {
        if (scope === null || scope === undefined) {
          return []
        }

        if (typeof scope === 'string') {
          scope = scope.split(' ')
        }

        const valid = scope.every(s => {
          return client.scopes.includes(s) && options.scopes.includes(s)
        })

        if (!valid) {
          throw new OAuthError('Invalid scope', {
            code: 400
          })
        }

        return scope
      },
      ...codeModel
    },
    accessTokenLifetime: options.services.tokenService.getAccessTokenLifetime(),
    refreshTokenLifetime: options.services.tokenService.getRefreshTokenLifetime()
  }

  if (options.integrations?.ad) {
    if (options.services.pkceService == null) {
      throw new Error('PKCE service is required for Azure AD integration')
    }

    if (options.services.userService.findADUser == null) {
      throw new Error('User service must implement findADUser for Azure AD integration')
    }

    AzureADGrantType.configure(
      options.integrations.ad,
      options.services.pkceService,
      options.services.userService
    )

    serverOptions.extendedGrantTypes = {
      ad: AzureADGrantType,
    }
  }
  serverOptions.extendedGrantTypes = {
    ...options.extendedGrantTypes,
    ...serverOptions.extendedGrantTypes
  }

  return new OAuth2Server(serverOptions)
}
