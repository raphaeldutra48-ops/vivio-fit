import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem isto, o DOM de um teste sobra para o seguinte e `getByLabelText` acha
// dois campos "Dose" que vieram de renderizações diferentes.
afterEach(cleanup);
