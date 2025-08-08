// src/types.d.ts (or global.d.ts)
declare module '*.module.scss' {
  const classes: { [className: string]: string };
  export default classes;
}
