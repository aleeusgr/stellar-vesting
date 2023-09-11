import { test, fc } from '@fast-check/vitest';

// for all a, b, c strings
// b is a substring of a + b + c
test.prop([fc.string(), fc.string(), fc.string()])('should detect the substring', (a, b, c) => {
  return (a + b + c).includes(b);
});

// same property but using named values
test.prop({ a: fc.string(), b: fc.string(), c: fc.string() })('should detect the substring', ({ a, b, c }) => {
  return (a + b + c).includes(b);
});
