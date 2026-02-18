import { useState } from "react";

const EyeIcon = ({ visible }) => {
  if (visible) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
        <path d="M9.1 5.08A10.47 10.47 0 0 1 12 4c5 0 9.27 3.11 11 8-0.52 1.46-1.3 2.77-2.27 3.88" />
        <path d="M6.61 6.61C4.62 7.82 3 9.7 2 12c1.73 4.89 6 8 10 8 1.33 0 2.6-0.25 3.77-0.7" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
};

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  required = false,
  autoComplete,
  name,
}) {
  const [visible, setVisible] = useState(false);

  const toggleVisibility = () => setVisible((prev) => !prev);
  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="password-field">
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        name={name}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={toggleVisibility}
        aria-label={label}
        title={label}
        aria-pressed={visible}
      >
        <EyeIcon visible={visible} />
      </button>
    </div>
  );
}
