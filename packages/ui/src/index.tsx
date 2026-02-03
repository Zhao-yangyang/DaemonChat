import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: "8px 12px",
        borderRadius: 6,
        border: "1px solid #e2e2e2",
        background: "#111",
        color: "#fff",
        cursor: "pointer",
        ...(props.style ?? {}),
      }}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #ddd",
        width: "100%",
        ...(props.style ?? {}),
      }}
    />
  );
}

export function Card({ children }: PropsWithChildren) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 16,
        background: "#fff",
      }}
    >
      {children}
    </div>
  );
}
