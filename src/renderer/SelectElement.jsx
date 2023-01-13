import React from 'react';
import PropTypes from 'prop-types';
import { sanitizeTitle } from './utils';

/**
 * Provides an extended select tag for selection one option from a list
 *
 * @param {Object} prop Custom element's properties
 *
 * @returns Virtual DOM wrapping an HTML select tag and supporting markup and code
 */
const SelectElement = (prop) => {
  const {
    id,
    name,
    type,
    title,
    dataItems,
    defaultValue,
    onChange,
    addBlankOption,
  } = prop;

  return (
    <label className="container" htmlFor={id}>
      <div className="item1">{title}</div>
      <div className="item2">
        <select id={id} name={name} onChange={onChange} value={defaultValue}>
          {addBlankOption ? (
            <option value="" name={name}>
              &nbsp;
            </option>
          ) : null}
          {[dataItems].flat().map((dataItem, dataItemIndex) => {
            const dataItemValue =
              type === 'number' && dataItem !== ''
                ? parseInt(dataItem, 10)
                : dataItem;
            const keyOption =
              dataItemValue !== ''
                ? `${dataItem}-${sanitizeTitle(dataItem)}`
                : `${title}-0-selectItem-${dataItemIndex}`;

            return (
              <option key={keyOption} value={dataItem} name={name}>
                {dataItemValue}
              </option>
            );
          })}
        </select>
      </div>
    </label>
  );
};

SelectElement.propType = {
  title: PropTypes.string.isRequired,
  defaultValue: PropTypes.oneOf([PropTypes.string, PropTypes.number]),
  dataItems: PropTypes.arrayOf(PropTypes.string),
  addBlankOption: PropTypes.bool,
  id: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func,
};

SelectElement.defaultProps = {
  defaultValue: '',
  addBlankOption: false,
  type: 'text',
  onChange: () => {},
};

export default SelectElement;
