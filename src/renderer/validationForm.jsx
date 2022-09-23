import React, { useState } from 'react';

const Ajv = require('ajv');

export function ValidationForm() {
  const [formData, setFormData] = useState({});
  let schema;

  // Async message handler
  window.electron.ipcRenderer.on('asynchronous-reply', (data) => {
    schema = JSON.parse(data);
    setFormData(schema.properties);
  });

  // Async message sender
  window.electron.ipcRenderer.sendMessage('asynchronous-message', 'async ping');

  const JsonValidationMessages = (jsonData) => {
    if (!jsonData) {
      return false;
    }

    const ajv = new Ajv();
    const validate = ajv.compile(schema);

    validate(jsonData);
    const validationMesssages = validate.errors?.map((error) => {
      return `Key: ${error.instancePath.replaceAll('/', '')} \n Error: ${
        error.message
      }`;
    });

    return validationMesssages;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const jsonData = {};

    Object.values(schema.properties)?.forEach((property) => {
      const { title } = property;
      jsonData[title.toLowerCase()] = e.target[title].value?.trim();
    });

    const validationMessages = JsonValidationMessages(jsonData);
    const message =
      validationMessages && validationMessages?.length !== 0
        ? `Data is not valid - \n ${validationMessages.join('\n \n')}`
        : 'Data is valid';

    window.alert(message); // eslint-disable-line no-alert
  };

  return (
    <form
      onSubmit={(e) => {
        handleSubmit(e);
      }}
    >
      {Object.values(formData).map((property) => {
        return (
          <>
            <label htmlFor={property.title}>
              <span>{property.title.replaceAll('_', ' ')}: &nbsp; </span>
              <input
                type="text"
                id={property.title}
                name={property.title}
                required1
              />
            </label>
            <br />
            <br />
          </>
        );
      })}
      <input type="submit" value="Submit" />
    </form>
  );
}

export default ValidationForm;