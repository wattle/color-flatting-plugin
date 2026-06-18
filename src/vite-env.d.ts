export {};

declare global {
  interface Window {
    onerror?: (error: { message: string; name: string; stack: string }) => boolean;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      "sp-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          variant?: "cta" | "primary" | "secondary" | "negative";
          disabled?: boolean;
          onClick?: (e: any) => void;
          size?: "s" | "m" | "l" | "xl";
        },
        HTMLElement
      >;
      "sp-icon": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          name?: string;
          size?: "s" | "m" | "l" | "xl";
        },
        HTMLElement
      >;
      "sp-divider": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          size?: "s" | "m" | "l";
        },
        HTMLElement
      >;
      "sp-dropdown": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          selected?: string;
          onChange?: (e: any) => void;
        },
        HTMLElement
      >;
      "sp-menu": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "sp-menu-item": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}