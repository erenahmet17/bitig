import { useEffect, useRef, useState } from 'react';

// Enter ile kaydeden, Esc ile vazgeçen küçük metin kutusu
export default function InlineInput({ initial = '', placeholder, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const done = useRef(false);
  const submit = () => {
    if (done.current) return; // Enter + blur aynı anda tetiklenirse iki kez eklemesin
    done.current = true;
    if (value.trim()) onSubmit(value);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      className="inline-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={submit}
    />
  );
}
