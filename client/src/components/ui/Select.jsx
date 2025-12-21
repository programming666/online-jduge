import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';

const Select = forwardRef(({ 
  label, 
  error, 
  className = '', 
  id,
  options = [],
  children,
  fullWidth = false,
  ...props 
}, ref) => {
  const selectId = id || props.name || Math.random().toString(36).substr(2, 9);
  
  const baseStyles = 'block rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring-primary/50 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors duration-200';
  const widthClass = fullWidth ? 'w-full' : '';
  const errorStyles = error 
    ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500' 
    : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary/50';

  return (
    <div className={`${widthClass} ${className}`}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-sm">
        <select
          ref={ref}
          id={selectId}
          className={`
            ${baseStyles} 
            ${errorStyles} 
            ${widthClass} 
            px-4 py-2 border
          `}
          {...props}
        >
          {options.length > 0 ? (
            options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          ) : (
            children
          )}
        </select>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

Select.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  className: PropTypes.string,
  id: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.string.isRequired,
  })),
  fullWidth: PropTypes.bool,
  children: PropTypes.node,
};

export default Select;
