import { describe, test } from 'vitest';
import { render } from '@testing-library/preact';
import App from '@pages/content/ui/app';

describe('appTest', () => {
  test('render text', () => {
    // given
    const text = 'content view';

    // when
    const { getByText } = render(<App />);

    // then
    getByText(text);
  });
});
