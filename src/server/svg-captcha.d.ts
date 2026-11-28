declare module 'svg-captcha' {
  export interface CaptchaConfig {
    size?: number;
    ignoreChars?: string;
    noise?: number;
    color?: boolean;
    background?: string;
    width?: number;
    height?: number;
    fontSize?: number;
    charPreset?: string;
  }

  export interface CaptchaObj {
    text: string;
    data: string;
  }

  export function create(options?: CaptchaConfig): CaptchaObj;
  export function createMathExpr(options?: CaptchaConfig): CaptchaObj;
  export function randomText(sizeOrOptions?: number | CaptchaConfig): string;

  const svgCaptcha: {
    create: typeof create;
    createMathExpr: typeof createMathExpr;
    randomText: typeof randomText;
  };

  export default svgCaptcha;
}
