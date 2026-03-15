import Select from 'react-select'

const glassStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: 'rgba(10, 14, 26, 0.6)',
    borderColor: state.isFocused ? 'rgba(96, 165, 250, 0.4)' : 'rgba(100, 160, 255, 0.15)',
    borderRadius: '0.75rem',
    padding: '2px 4px',
    boxShadow: state.isFocused ? '0 0 0 1px rgba(96, 165, 250, 0.2)' : 'none',
    '&:hover': { borderColor: 'rgba(96, 165, 250, 0.3)' },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(100, 160, 255, 0.15)',
    borderRadius: '0.75rem',
    overflow: 'hidden',
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'rgba(96, 165, 250, 0.2)'
      : state.isFocused
      ? 'rgba(96, 165, 250, 0.1)'
      : 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
  }),
  singleValue: (base) => ({ ...base, color: '#e2e8f0' }),
  input: (base) => ({ ...base, color: '#e2e8f0' }),
  placeholder: (base) => ({ ...base, color: 'rgba(148, 163, 184, 0.5)' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({ ...base, color: 'rgba(148, 163, 184, 0.5)' }),
}

export default function SearchSelect({ options, value, onChange, placeholder, isMulti = false, ...props }) {
  return (
    <Select
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      isMulti={isMulti}
      isSearchable
      styles={glassStyles}
      {...props}
    />
  )
}
