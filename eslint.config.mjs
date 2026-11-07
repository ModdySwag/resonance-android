// ESLint (flat config) for the bundled page: the shell shim and the app's own modules.
//
// These files are plain browser scripts sharing one global scope, so the rule set is aimed at
// defects a typo can cause (duplicate keys, unreachable code, self-assignment, bad typeof,
// fallthrough), not at formatting. `no-empty` is off on purpose: empty catch blocks are used
// deliberately around WebView and audio calls that are allowed to fail.
//
// Run:  npx --yes eslint@9 --config eslint.config.mjs app/src/main/assets/www

export default [
  {
    files: ["app/src/main/assets/www/**/*.js"],
    languageOptions: {
      ecmaVersion: 2017,
      sourceType: "script",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly",
        localStorage: "readonly", sessionStorage: "readonly", console: "readonly",
        location: "readonly", history: "readonly", screen: "readonly",
        devicePixelRatio: "readonly", matchMedia: "readonly", alert: "readonly",
        confirm: "readonly", prompt: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        performance: "readonly", fetch: "readonly", URL: "readonly",
        Blob: "readonly", FileReader: "readonly", FormData: "readonly",
        Image: "readonly", Audio: "readonly", Event: "readonly",
        CustomEvent: "readonly", HTMLElement: "readonly", Node: "readonly",
        Promise: "readonly", Map: "readonly", Set: "readonly",
        Uint8Array: "readonly", Float32Array: "readonly", Int16Array: "readonly",
        AudioContext: "readonly", webkitAudioContext: "readonly",
        OfflineAudioContext: "readonly", ResizeObserver: "readonly",
        MutationObserver: "readonly", getComputedStyle: "readonly",
        btoa: "readonly", atob: "readonly", encodeURIComponent: "readonly",
        decodeURIComponent: "readonly", isNaN: "readonly", parseInt: "readonly",
        parseFloat: "readonly", JSON: "readonly", Math: "readonly", Date: "readonly"
      }
    },
    rules: {
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "no-sparse-arrays": "error",
      "no-unexpected-multiline": "error",
      "no-cond-assign": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-empty-pattern": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-obj-calls": "error",
      "no-redeclare": "error",
      "no-unsafe-negation": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-debugger": "error",
      "no-empty": "off",
      "no-unused-vars": "off",
      "no-undef": "off"
    }
  }
];
