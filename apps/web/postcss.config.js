/**
 * PostCSS configuration for the Next.js frontend.
 *
 * The original file used an ES module default export. Next.js expects a
 * CommonJS module that directly exports an object with a `plugins` key. When
 * using `export default`, the configuration is nested under `config.default`
 * and Next.js cannot find the `plugins` property, triggering build errors like
 * "Your custom PostCSS configuration must export a `plugins` key.".
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
