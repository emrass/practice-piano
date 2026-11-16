// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appFiles } from './serviceWorker';

const page = (head: string) => new DOMParser().parseFromString(`<!doctype html><html><head>${head}</head><body><div id="root"></div></body></html>`, 'text/html');

describe('appFiles', () => {
  const build = (js: string, css: string, extra = '') =>
    page(`<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./favicon.svg">
      <script type="module" crossorigin src="./assets/${js}.js"></script><link rel="stylesheet" crossorigin href="./assets/${css}.css">${extra}`);

  it('lists the build’s own scripts and stylesheets', () => {
    expect(appFiles(build('index-a1', 'index-b1'))).toBe('./assets/index-a1.js\n./assets/index-b1.css');
  });

  it('differs when the code or only the styles change, not otherwise', () => {
    const before = appFiles(build('index-a1', 'index-b1'));
    expect(appFiles(build('index-a1', 'index-b1', '<meta name="theme-color" content="#fff">'))).toBe(before);
    expect(appFiles(build('index-a2', 'index-b1'))).not.toBe(before);
    expect(appFiles(build('index-a1', 'index-b2'))).not.toBe(before);
  });

  it('leaves out scripts from other sites', () => {
    const analytics = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js"></script><script src="//cdn.example/x.js"></script>';
    expect(appFiles(build('index-a1', 'index-b1', analytics))).toBe(appFiles(build('index-a1', 'index-b1')));
  });
});
