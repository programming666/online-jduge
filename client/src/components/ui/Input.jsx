import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';

const Input = forwardRef(({ 
  label, 
  error, 
  className = '', 
  id,
  type = 'text',
  fullWidth = false,
  suffix,
  ...props 
}, ref) => {
  const inputId = id || props.name || Math.random().toString(36).substr(2, 9);
  
  const baseStyles = 'block rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring-primary/50 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors duration-200';
  const widthClass = fullWidth ? 'w-full' : '';
  const errorStyles = error 
    ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500' 
    : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary/50';
  const paddingRight = suffix ? 'pr-10' : 'px-4';

  return (
    <div className={`${widthClass} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-sm">
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={`
            ${baseStyles} 
            ${errorStyles} 
            ${widthClass} 
            pl-4 ${paddingRight} py-2 border
          `}
          {...props}
        />
        {suffix && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-auto">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  className: PropTypes.string,
  id: PropTypes.string,
  type: PropTypes.string,
  fullWidth: PropTypes.bool,
  suffix: PropTypes.node,
};

export default Input;
