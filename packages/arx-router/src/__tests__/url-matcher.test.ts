import { describe, expect, it } from 'vitest'
import { UrlMatcher } from '../url-matcher'

describe('UrlMatcher', () => {
  it('should add and find a simple path', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/home', 'HomePage')

    // Act
    const result = matcher.find('/home')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.store).toBe('HomePage')
    expect(result?.params).toEqual({})
  })

  it('should return null for a path that does not exist', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/home', 'HomePage')

    // Act
    const result = matcher.find('/about')

    // Assert
    expect(result).toBeNull()
  })

  it('should add and find a path with a parameter', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/users/:id', 'UserPage')

    // Act
    const result = matcher.find('/users/123')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.store).toBe('UserPage')
    expect(result?.params).toEqual({ id: '123' })
  })

  it('should add and find a path with multiple parameters', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/posts/:year/:month/:slug', 'PostPage')

    // Act
    const result = matcher.find('/posts/2023/10/hello-world')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.store).toBe('PostPage')
    expect(result?.params).toEqual({ year: '2023', month: '10', slug: 'hello-world' })
  })

  it('should add and find a path with an optional parameter', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/files/:name?', 'FilePage')

    // Act
    const resultWithParam = matcher.find('/files/document')
    const resultWithoutParam = matcher.find('/files')

    // Assert
    expect(resultWithParam).not.toBeNull()
    expect(resultWithParam?.store).toBe('FilePage')
    expect(resultWithParam?.params).toEqual({ name: 'document' })

    expect(resultWithoutParam).not.toBeNull()
    expect(resultWithoutParam?.store).toBe('FilePage')
    expect(resultWithoutParam?.params).toEqual({})
  })

  it('should add and find a path with a wildcard', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/assets/*', 'AssetHandler')

    // Act
    const result = matcher.find('/assets/images/logo.png')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.store).toBe('AssetHandler')
    expect(result?.params).toEqual({ '*': 'images/logo.png' })
  })

  it('should handle a mix of parameters and wildcards', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/data/:type/*', 'DataHandler')

    // Act
    const result = matcher.find('/data/users/profile/details')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.store).toBe('DataHandler')
    expect(result?.params).toEqual({ type: 'users', '*': 'profile/details' })
  })

  it('should prioritize more specific routes', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/users/new', 'NewUserPage')
    matcher.add('/users/:id', 'UserPage')

    // Act
    const resultSpecific = matcher.find('/users/new')
    const resultParam = matcher.find('/users/123')

    // Assert
    expect(resultSpecific).not.toBeNull()
    expect(resultSpecific?.store).toBe('NewUserPage')
    expect(resultSpecific?.params).toEqual({})

    expect(resultParam).not.toBeNull()
    expect(resultParam?.store).toBe('UserPage')
    expect(resultParam?.params).toEqual({ id: '123' })
  })

  it('should handle root path', () => {
    // Arrange
    const matcher = new UrlMatcher()
    matcher.add('/', 'RootPage')

    // Act
    const result = matcher.find('/')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.store).toBe('RootPage')
    expect(result?.params).toEqual({})
  })
})
