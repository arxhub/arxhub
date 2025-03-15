import { describe, expect, it } from 'vitest';
import { splitPathname } from './split-pathname';

describe('splitPathname', () => {
  it('should return the correct path, name, and extension for a given pathname', () => {
    expect(splitPathname('/path/to/file.txt')).toEqual({
      path: '/path/to',
      name: 'file',
      ext: 'txt',
    });
  });

  it('should return an empty path if the pathname is just a filename', () => {
    expect(splitPathname('file.txt')).toEqual({
      path: '',
      name: 'file',
      ext: 'txt',
    });
  });

  it('should return an empty extension if the file has no extension', () => {
    expect(splitPathname('/path/to/file')).toEqual({
      path: '/path/to',
      name: 'file',
      ext: '',
    });
  });

  it('should handle pathnames with multiple dots in the filename', () => {
    expect(splitPathname('/path/to/file.name.txt')).toEqual({
      path: '/path/to',
      name: 'file.name',
      ext: 'txt',
    });
  });

  it('should handle pathnames with no path or extension', () => {
    expect(splitPathname('file')).toEqual({
      path: '',
      name: 'file',
      ext: '',
    });
  });

  it('should handle an empty pathname', () => {
    expect(splitPathname('')).toEqual({
      path: '',
      name: '',
      ext: '',
    });
  });

  it('should handle a pathname with only a slash', () => {
    expect(splitPathname('/')).toEqual({
      path: '',
      name: '',
      ext: '',
    });
  });

  it('should handle a pathname with a trailing slash', () => {
    expect(splitPathname('/path/to/')).toEqual({
      path: '/path/to',
      name: '',
      ext: '',
    });
  });

  it('should handle file paths like /path/.gitignore', () => {
    expect(splitPathname('/path/.gitignore')).toEqual({
      path: '/path',
      name: '.gitignore',
      ext: '',
    });
  });
});
