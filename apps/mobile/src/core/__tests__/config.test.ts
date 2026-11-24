import { urlInstagram } from '../config';

describe('urlInstagram', () => {
  it('aceita só perfis do Instagram em https', () => {
    expect(urlInstagram('https://instagram.com/abracoanimal')).toBe(
      'https://instagram.com/abracoanimal',
    );
    expect(urlInstagram(' https://www.instagram.com/abraco.animal/ ')).toBe(
      'https://www.instagram.com/abraco.animal/',
    );
    expect(urlInstagram('http://instagram.com/x')).toBeNull();
    expect(urlInstagram('https://instagram.com.golpe.io/x')).toBeNull();
    expect(urlInstagram('javascript:alert(1)')).toBeNull();
    expect(urlInstagram(undefined)).toBeNull();
    expect(urlInstagram('')).toBeNull();
  });
});
