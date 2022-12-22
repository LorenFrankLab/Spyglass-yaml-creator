import React, { useState, useRef, useEffect } from 'react';
import InputElement from './InputElement';
import SelectElement from './SelectElement';
import FileUpload from './FileUpload';
import DataListElement from './DataListElement';
import arrayDefaultValues from './arrayDefaultValues';
import deviceTypeMap from './deviceTypes';
import ChannelMap from './ChannelMap';
import SelectInputPairElement from './SelectInputPairElement';
import ArrayUpdateMenu from './ArrayUpdateMenu';
import CheckboxList from './CheckboxList';
import {
  ASYNC_TOPICS,
  commaSeparatedStringToNumber,
  sanitizeTitle,
  titleCase,
  showCustomValidityError,
} from './utils';
import {
  labs,
  genders,
  device,
  locations,
  deviceTypes,
  units,
  species,
  behavioralEventsNames,
  behavioralEventsDescription,
} from './list';

const Ajv = require('ajv');

const { ipcRenderer } = window.electron;

/**
 * Main component
 *
 * @returns Virtual DOM
 */
export function YMLGenerator() {
  const [formData, setFormData] = useState({
    experimenter_name: '',
    lab: 'Frank Lab',
    institution: 'University of California, San Francisco',
    experiment_description: '',
    session_description: '',
    subject: {
      description: '',
      genotype: '',
      sex: 'Male',
      species: 'Long-Evans Rat',
      subject_id: '',
      weight: 0,
    },
    data_acq_device: [],
    associated_files: [],
    units: {
      analog: '',
      behavioral_events: '',
    },
    times_period_multiplier: 1.0,
    raw_data_to_volts: 1.0,
    default_header_file_path: '',
    cameras: [],
    tasks: [],
    behavioral_events: [],
    associated_video_files: [],
    device: 'Tetrode',
    electrode_groups: [],
    ntrode_electrode_group_channel_map: [],
  });

  const [cameraIdsDefined, setCameraIdsDefined] = useState([]);

  const [taskEpochsDefined, setTaskEpochsDefined] = useState([]);

  const schema = useRef({});

  const downloadExistingFile = (e) => {
    e.preventDefault();
    ipcRenderer.sendMessage('REQUEST_OPEN_TEMPLATE_FILE_BOX');
  };

  const updateFormData = (name, value, key, index) => {
    const form = structuredClone(formData);
    if (key === undefined) {
      form[name] = value; // key value pair
    } else if (index === undefined) {
      form[key][name] = value; // object (as defined in json schema)
    } else {
      // if (typeof value === 'string' && value?.trim() === '') {
      //   return;
      // }
      form[key][index] = form[key][index] || {};
      form[key][index][name] = value; // array (as defined in json schema)
    }
    setFormData(form);
  };

  const onBlur = (e, metaData) => {
    const { target } = e;
    const { name, value, type } = target;
    const { key, index, isCommaSeparatedStringToNumber } = metaData || {};
    let inputValue = '';

    if (!isCommaSeparatedStringToNumber) {
      inputValue = type === 'number' ? parseInt(value, 10) : value;
    } else {
      inputValue = commaSeparatedStringToNumber(value);
    }

    updateFormData(name, inputValue, key, index);
  };

  const onMapInput = (e, metaData) => {
    const { target } = e;
    const { value } = target;
    const { key, index, shankNumber, electrodeGroupId } = metaData;
    const form = structuredClone(formData);
    const nTrodes = form[key].filter(
      (item) => item.electrode_group_id === electrodeGroupId
    );

    if (nTrodes.length === 0) {
      return null;
    }

    nTrodes[shankNumber].map[index] = value;
    setFormData(form);
    return null;
  };

  const itemSelected = (e, metaData) => {
    const { target } = e;
    const { name, value } = target;
    const { key, index } = metaData || {};

    updateFormData(name, value, key, index);
  };

  const itemFileUpload = (e, value, metaData) => {
    const { name } = e.target;
    const { key, index } = metaData || {};

    updateFormData(name, value, key, index);
  };

  const nTrodeMapSelected = (e, metaData) => {
    const form = structuredClone(formData);
    const { value } = e.target;
    const { key, index } = metaData;
    const electrodeGroupId = form.electrode_groups[index].id;
    const deviceTypeMapping = structuredClone(deviceTypeMap[value]);
    const nTrode = {
      ...arrayDefaultValues.ntrode_electrode_group_channel_map,
    };
    const shankCount = deviceTypeMapping?.items?.shankCount || 0;
    const nTrodes = structuredClone(Array(shankCount).fill(nTrode));
    const map = {};

    form[key][index].device_type = value;

    // set map with default values
    Object.values(deviceTypeMapping?.items?.properties || []).forEach(
      (property) => {
        map[parseInt(property.title, 10)] = property.default;
      }
    );

    nTrodes.forEach((n, nIndex) => {
      n.ntrode_id = nIndex + 1 + electrodeGroupId;
      n.electrode_group_id = electrodeGroupId;
      n.map = { ...map };
    });

    const nTrodeMapFormData = form.ntrode_electrode_group_channel_map.filter(
      (n) => n.electrode_group_id !== electrodeGroupId
    );

    form.ntrode_electrode_group_channel_map =
      structuredClone(nTrodeMapFormData);

    nTrodes.forEach((n) => {
      form.ntrode_electrode_group_channel_map.push(n);
    });

    setFormData(form);

    return null;
  };

  const addArrayItem = (key, count = 1) => {
    const form = structuredClone(formData);
    const arrayDefaultValue = arrayDefaultValues[key];
    const items = Array(count).fill({ ...arrayDefaultValue });
    const formItems = form[key];
    const idValues = formItems
      .map((formItem) => formItem.id)
      .filter((formItem) => formItem !== undefined);
    // -1 means no id field, else there it exist and get max
    let maxId = -1;

    if (arrayDefaultValue.id !== undefined) {
      maxId = idValues.length > 0 ? Math.max(...idValues) + 1 : 0;
    }

    items.forEach((item) => {
      const selectedItem = { ...item }; // best never to directly alter iterator

      // if id exist, increment to avoid duplicates
      if (maxId !== -1) {
        maxId += 1;
        selectedItem.id = maxId - 1; // -1 makes this start from 0
      }

      formItems.push(selectedItem);
    });

    setFormData(form);
  };

  const removeArrayItem = (key) => {
    const form = structuredClone(formData);
    const items = form[key].pop();

    setFormData(form);
  };

  /**
   * Displays an error message to the user if Ajv fails validation
   *
   * @param {object} error Ajv's error object
   * @returns
   */
  const showErrorMessage = (error) => {
    const { message, instancePath } = error;
    const idComponents = error.instancePath.split('/').filter((e) => e !== '');
    let id = '';

    if (idComponents.length === 1) {
      // eslint-disable-next-line prefer-destructuring
      id = idComponents[0];
    } else if (idComponents.length === 2) {
      id = `${idComponents[0]}-${idComponents[1]}`;
    } else {
      id = `${idComponents[0]}-${idComponents[2]}-${idComponents[1]}`;
    }

    const element = document.querySelector(`#${id}`);
    const sanitizeMessage = (validateMessage) => {
      if (validateMessage === 'must match pattern "^.+$"') {
        return `${id} cannot be empty nor all whitespace`;
      }
      return validateMessage;
    };

    const userFriendlyMessage = sanitizeMessage(message);

    // setCustomValidity is only supported on input tags
    if (element.tagName === 'INPUT') {
      showCustomValidityError(element, userFriendlyMessage);
      return;
    }

    if (element && element.focus) {
      element.focus();
    }

    // If here, element not found or cannot show validation message with
    // setCustomValidity/reportValidity; so show a pop-up message
    const itemName = titleCase(
      instancePath.replaceAll('/', '').replaceAll('_', ' ')
    );

    // eslint-disable-next-line no-alert
    window.alert(`${itemName} - ${userFriendlyMessage}`);
  };

  const validateJSON = (formContent) => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema.current);

    validate(formContent);

    const validationMessages =
      validate.errors?.map((error) => {
        return `Key: ${error.instancePath.replaceAll('/', '')} \n Error: ${
          error.message
        }`;
      }) || [];

    const isValid = validate.errors === null;

    const message = isValid
      ? 'Data is valid'
      : `Data is not valid - \n ${validationMessages.join('\n \n')}`;

    if (validate.errors) {
      validate.errors.forEach((error) => {
        showErrorMessage(error);
      });
    }

    return {
      isValid,
      message,
    };
  };

  const generateYMLFile = (e) => {
    e.preventDefault();
    const form = structuredClone(formData);

    const validation = validateJSON(form);
    const { isValid } = validation;

    if (isValid) {
      ipcRenderer.sendMessage('SAVE_USER_DATA', form);
    }
  };

  useEffect(() => {
    ipcRenderer.sendMessage('asynchronous-message', 'async ping');
  }, []);

  useEffect(() => {
    ipcRenderer.on(ASYNC_TOPICS.jsonFileRead, (data) => {
      schema.current = JSON.parse(data);
    });
  }, []);

  useEffect(() => {
    ipcRenderer.on(ASYNC_TOPICS.templateFileRead, (jsonFileContent) => {
      const JSONschema = schema.current;
      const validation = validateJSON(jsonFileContent, JSONschema);
      const { isValid, message } = validation;

      if (!isValid) {
        // eslint-disable-next-line no-alert
        window.alert(
          `There were validation errors: ${(message.join || [])('')}`
        );
        return null;
      }

      setFormData(jsonFileContent);
      return null;
    });
  }, []);

  useEffect(() => {
    // updated tracked camera ids
    const cameraIds = formData.cameras.map((camera) => camera.id);
    setCameraIdsDefined([...[...new Set(cameraIds)]]);

    // update tracked task epochs
    const taskEpochs = [
      ...[
        ...new Set(
          (formData.tasks.map((tasks) => tasks.task_epochs) || []).flat().sort()
        ),
      ],
    ];
    setTaskEpochsDefined(taskEpochs);
  }, [formData]);

  return (
    <>
      <h2 className="header-text">
        Rec-to-NWB YAML Creator &nbsp;
        <button
          type="button"
          className="download-existing-file"
          onClick={downloadExistingFile}
        >
          <span className="bold" title="Download an existing file for updating">
            &#128194;
          </span>
        </button>
      </h2>
      <form
        encType="multipart/form-data"
        className="form-control"
        name="nwbData"
        onSubmit={(e) => {
          generateYMLFile(e);
        }}
      >
        <div className="form-container">
          <InputElement
            id="experimenter_name"
            type="text"
            name="experimenter_name"
            defaultValue={formData.experimenter_name}
            title="Experimenter Name"
            placeholder="Name of experimenter performing current session"
            required
            onBlur={(e) => onBlur(e)}
          />
          <InputElement
            id="lab"
            type="text"
            name="lab"
            title="Lab"
            defaultValue={formData.lab}
            placeholder="Laboratory where the experiment is conducted"
            required
            onBlur={(e) => onBlur(e)}
          />
          <DataListElement
            id="institution"
            name="institution"
            title="Institution"
            defaultValue={formData.institution}
            dataItems={labs()}
            onChange={(e) => itemSelected(e)}
          />
        </div>
        <InputElement
          id="experiment_description"
          type="text"
          name="experiment_description"
          title="Experiment Description"
          placeholder="Description of experiment"
          defaultValue={formData.experiment_description}
          onBlur={(e) => onBlur(e)}
        />
        <InputElement
          id="session_description"
          type="text"
          name="session_description"
          title="Session Description"
          placeholder="Desscription of current session"
          defaultValue={formData.session_description}
          onBlur={(e) => onBlur(e)}
        />

        <div>
          <fieldset>
            <legend>Subject</legend>
            <div className="form-container">
              <InputElement
                id="subject-description"
                type="text"
                name="description"
                title="Description"
                defaultValue={formData.subject.description}
                required
                placeholder="Summary of animal model/patient/specimen being examined"
                onBlur={(e) => onBlur(e, { key: 'subject' })}
              />
              <InputElement
                id="subject-genotype"
                type="text"
                name="genotype"
                title="Genotype"
                required
                defaultValue={formData.subject.genotype}
                placeholder="Genetic summary of animal model/patient/specimen"
                onBlur={(e) => onBlur(e, { key: 'subject' })}
              />
              <SelectElement
                id="subject-sex"
                name="sex"
                title="Sex"
                dataItems={genders()}
                defaultValue={formData.subject.sex}
                onChange={(e) => itemSelected(e, { key: 'subject' })}
              />
              <DataListElement
                id="subject-species"
                name="species"
                title="Species"
                defaultValue={formData.subject.species}
                dataItems={species()}
                onChange={(e) => itemSelected(e, { key: 'subject' })}
              />
              <InputElement
                id="subject-subjectId"
                type="text"
                name="subject_id"
                title="Subject Id"
                required
                defaultValue={formData.subject.subject_id}
                placeholder="Identification code/number of animal model/patient"
                onBlur={(e) => onBlur(e, { key: 'subject' })}
              />
              <InputElement
                id="subject-weight"
                type="number"
                name="weight"
                title="Weight"
                required
                defaultValue={formData.subject.weight}
                placeholder="Mass of animal model/patient in grams"
                onBlur={(e) => onBlur(e, { key: 'subject' })}
              />
            </div>
          </fieldset>
        </div>

        <div id="data_acq_device">
          <fieldset>
            <legend>Data Acq Device</legend>
            <div>
              {formData.data_acq_device.map((dataAcqDevice, index) => {
                const key = 'data_acq_device';

                return (
                  <fieldset
                    key={sanitizeTitle(`${dataAcqDevice.name}-dad-${index}`)}
                    className="array-item"
                  >
                    <legend> Item #{index + 1} </legend>
                    <div
                      id={`dataAcqDevice-${index + 1}`}
                      className="form-container"
                    >
                      <InputElement
                        id={`data_acq_device-name-${index}`}
                        type="text"
                        name="name"
                        title="Name"
                        required
                        defaultValue={dataAcqDevice.name}
                        placeholder="name"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`data_acq_device-system-${index}`}
                        type="text"
                        name="system"
                        title="System"
                        required
                        defaultValue={dataAcqDevice.system}
                        placeholder="system"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`data_acq_device-amplifier-${index}`}
                        type="text"
                        name="amplifier"
                        title="Amplifier"
                        required
                        defaultValue={dataAcqDevice.amplifier}
                        placeholder="amplifier"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`data_acq_device-adc_circuit-${index}`}
                        type="text"
                        name="adc_circuit"
                        title="ADC circuit"
                        required
                        defaultValue={dataAcqDevice.adc_circuit}
                        placeholder="adc circuit"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <ArrayUpdateMenu
              itemsKey="data_acq_device"
              items={formData.data_acq_device}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <div>
          <fieldset>
            <legend>Tasks</legend>
            <div className="form-container">
              {formData.tasks.map((tasks, index) => {
                const key = 'tasks';

                return (
                  <fieldset
                    key={sanitizeTitle(`${tasks.task_name}-ts-${index}`)}
                    className="array-item"
                  >
                    <legend> Item #{index + 1} </legend>
                    <div className="form-container">
                      <InputElement
                        id={`tasks-task_name-${index}`}
                        type="text"
                        name="task_name"
                        title="Task Name"
                        required
                        defaultValue={tasks.task_name}
                        placeholder="Task Name"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`tasks-task_description-${index}`}
                        type="text"
                        name="task_description"
                        title="Task Description"
                        required
                        defaultValue={tasks.task_description}
                        placeholder="Task Description"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`tasks-task_environment-${index}`}
                        type="text"
                        name="task_environment"
                        title="Task Environment"
                        defaultValue={tasks.task_environment}
                        placeholder="Task Environment"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <CheckboxList
                        id={`tasks-camera_id-${index}`}
                        type="number"
                        name="camera_id"
                        title="Camera Id"
                        objectKind="Camera"
                        required
                        defaultValue={tasks.camera_id}
                        placeholder="Camera ids"
                        dataItems={cameraIdsDefined}
                        updateFormData={updateFormData}
                        metaData={{
                          nameValue: 'camera_id',
                          keyValue: 'tasks',
                          index,
                        }}
                        onChange={updateFormData}
                      />

                      <InputElement
                        id={`tasks-task_epochs-${index}`}
                        type="text"
                        name="task_epochs"
                        title="Task Epochs"
                        required
                        defaultValue={tasks.task_epochs}
                        placeholder="Task Epochs"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                            isCommaSeparatedStringToNumber: true,
                          })
                        }
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <ArrayUpdateMenu
              itemsKey="tasks"
              items={formData.tasks}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <div>
          <fieldset>
            <legend>Associated Files</legend>
            <div className="form-container">
              {formData.associated_files.map((associatedFilesName, index) => {
                const key = 'associated_files';

                return (
                  <fieldset
                    key={sanitizeTitle(
                      `${associatedFilesName.name}-afn-${index}`
                    )}
                    className="array-item"
                  >
                    <legend> Item #{index + 1} </legend>
                    <div className="form-container">
                      <InputElement
                        id={`associated_files-name-${index}`}
                        type="text"
                        name="name"
                        title="Name"
                        required
                        defaultValue={associatedFilesName.name}
                        placeholder="File name"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`associated_files-description-${index}`}
                        type="text"
                        name="description"
                        title="Description"
                        required
                        defaultValue={associatedFilesName.description}
                        placeholder="description"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <FileUpload
                        id={`associated_files-path-${index}`}
                        title="Path"
                        name="path"
                        placeholder="path"
                        defaultValue={associatedFilesName.path}
                        metaData={{
                          key,
                          index,
                        }}
                        onTextFieldInput={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                        onBlur={itemFileUpload}
                      />
                      <CheckboxList
                        id={`associated_files-taskEpochs-${index}`}
                        type="number"
                        name="task_epochs"
                        title="Task Epochs"
                        objectKind="Task"
                        required
                        defaultValue={associatedFilesName.task_epochs}
                        placeholder="Task Epochs"
                        dataItems={taskEpochsDefined}
                        updateFormData={updateFormData}
                        metaData={{
                          nameValue: 'task_epochs',
                          keyValue: 'associated_files',
                          index,
                        }}
                        onChange={updateFormData}
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <ArrayUpdateMenu
              itemsKey="associated_files"
              items={formData.associated_files}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <div>
          <fieldset>
            <legend>Units</legend>
            <div className="form-container">
              <InputElement
                id="analog"
                type="text"
                name="analog"
                title="Analog"
                placeholder="Analog"
                defaultValue={formData.units.analog}
                onBlur={(e) => onBlur(e, { key: 'units' })}
              />
              <InputElement
                id="behavioralEvents"
                type="text"
                name="behavioral_events"
                title="Behavioral Events"
                placeholder="Behavioral Events"
                defaultValue={formData.units.behavioral_events}
                onBlur={(e) => onBlur(e, { key: 'units' })}
              />
            </div>
          </fieldset>
        </div>

        <InputElement
          id="times_period_multiplier"
          type="number"
          name="times_period_multiplier"
          title="Times Period Multiplier"
          placeholder="Times Period Multiplier"
          defaultValue={formData.times_period_multiplier}
          onBlur={(e) => onBlur(e)}
        />

        <InputElement
          id="raw_data_to_volts"
          type="number"
          name="raw_data_to_volts"
          title="Raw Data to Volts"
          placeholder="raw data to volts"
          defaultValue={formData.raw_data_to_volts}
          onBlur={(e) => onBlur(e)}
        />

        <FileUpload
          id="defaultHeaderFilePath"
          title="Default Header File Path"
          name="default_header_file_path"
          placeholder="Default Header File Path"
          onTextFieldInput={(e) => onBlur(e)}
          defaultValue={formData.default_header_file_path}
          onBlur={itemFileUpload}
        />

        <div>
          <fieldset>
            <legend>Cameras</legend>
            <div className="form-container">
              {formData.cameras.map((cameras, index) => {
                const key = 'cameras';
                return (
                  <fieldset
                    key={`cameras-${sanitizeTitle(cameras.id)}`}
                    className="array-item"
                  >
                    <legend> Item #{index + 1} </legend>
                    <div className="form-container">
                      <InputElement
                        id={`cameras-id-${index}`}
                        type="number"
                        name="id"
                        title="Id"
                        required
                        defaultValue={cameras.id}
                        placeholder="Id"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`cameras-metersperpixel-${index}`}
                        type="number"
                        name="meters_per_pixel"
                        title="Meters Per Pixel"
                        defaultValue={cameras.meters_per_pixel}
                        required
                        placeholder="Meters Per Pixel"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            indexCount: index,
                          })
                        }
                      />
                      <InputElement
                        id={`cameras-manufacturer-${index}`}
                        type="text"
                        name="manufacturer"
                        title="Manufacturer"
                        defaultValue={cameras.manufacturer}
                        placeholder="Manufacturer"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`cameras-model-${index}`}
                        type="text"
                        name="model"
                        title="model"
                        defaultValue={cameras.model}
                        placeholder="model"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`cameras-lens-${index}`}
                        type="text"
                        name="lens"
                        title="lens"
                        defaultValue={cameras.lens}
                        placeholder="Lens"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />{' '}
                      <InputElement
                        id={`cameras-cameraname-${index}`}
                        type="text"
                        name="camera_name"
                        title="Camera Name"
                        defaultValue={cameras.camera_name}
                        placeholder="Camera Name"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <ArrayUpdateMenu
              itemsKey="cameras"
              items={formData.cameras}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <div>
          <fieldset>
            <legend>Associated Video Files</legend>
            <div className="form-container">
              {formData.associated_video_files.map(
                (associatedVideoFiles, index) => {
                  const key = 'associated_video_files';
                  return (
                    <fieldset
                      key={sanitizeTitle(
                        `${associatedVideoFiles.name}-avf-${index}`
                      )}
                      className="array-item"
                    >
                      <legend> Item #{index + 1} </legend>
                      <div className="form-container">
                        <InputElement
                          id={`associated_video_files-name-${index}`}
                          type="text"
                          name="name"
                          title="Name"
                          required
                          defaultValue={associatedVideoFiles.name}
                          placeholder="name"
                          onBlur={(e) =>
                            onBlur(e, {
                              key,
                              index,
                            })
                          }
                        />
                        <SelectElement
                          id={`associated_video_files-camera_id-${index}`}
                          type="number"
                          name="camera_id"
                          title="Camera Id"
                          required
                          placeholder="Camera Id"
                          defaultValue={associatedVideoFiles.camera_id}
                          dataItems={cameraIdsDefined}
                          onChange={(e) => itemSelected(e)}
                        />
                      </div>
                    </fieldset>
                  );
                }
              )}
            </div>
            <ArrayUpdateMenu
              itemsKey="associated_video_files"
              items={formData.associated_video_filestasks}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <div>
          <fieldset>
            <legend>Behavioral Events</legend>
            <div className="form-container">
              {formData.behavioral_events.map((behavioralEvents, index) => {
                const key = 'behavioral_events';

                return (
                  <fieldset
                    key={sanitizeTitle(
                      `${behavioralEvents.description}-be-${index}`
                    )}
                    className="array-item"
                  >
                    <legend> Item #{index + 1} </legend>
                    <div className="form-container">
                      <SelectInputPairElement
                        id={`behavioral_events-description-${index}`}
                        type="number"
                        name="description"
                        title="Description"
                        items={behavioralEventsDescription()}
                        required
                        defaultValue={behavioralEvents.description}
                        placeholder="description"
                        metaData={{
                          key,
                          index,
                        }}
                        onBlur={onBlur}
                      />
                      <DataListElement
                        id={`behavioral_events-name-${index}`}
                        name="name"
                        title="Name"
                        dataItems={behavioralEventsNames()}
                        defaultValue={behavioralEvents.name}
                        onChange={(e) =>
                          itemSelected(e, {
                            key,
                            index,
                          })
                        }
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <ArrayUpdateMenu
              itemsKey="behavioral_events"
              items={formData.behavioral_events}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <SelectElement
          id="device"
          name="device"
          title="Device"
          dataItems={device()}
          defaultValue={formData.device}
          onChange={(e) => itemSelected(e)}
        />

        <div>
          <fieldset>
            <legend>Electrode Groups</legend>
            <div className="form-container">
              {formData.electrode_groups.map((electrodeGroup, index) => {
                const electrodeGroupId = electrodeGroup.id;
                const nTrodeItems =
                  formData?.ntrode_electrode_group_channel_map?.filter(
                    (n) => n.electrode_group_id === electrodeGroupId
                  ) || [];
                const key = 'electrode_groups';

                return (
                  <fieldset key={electrodeGroupId} className="array-item">
                    <legend> Item #{index + 1} </legend>
                    <div className="form-container">
                      <InputElement
                        id={`electrode_groups-id-${index}`}
                        type="number"
                        name="id"
                        title="Id"
                        required
                        defaultValue={electrodeGroup.id}
                        placeholder="Id"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <DataListElement
                        id={`electrode_groups-location-${index}`}
                        name="location"
                        title="Location"
                        defaultValue={electrodeGroup.location}
                        dataItems={locations()}
                        onChange={(e) =>
                          itemSelected(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <SelectElement
                        id={`electrode_groups-device_type-${index}`}
                        name="device_type"
                        title="Device Type"
                        dataItems={deviceTypes()}
                        defaultValue={electrodeGroup.deviceType}
                        onChange={(e) =>
                          nTrodeMapSelected(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`electrode_groups-description-${index}`}
                        type="text"
                        name="description"
                        title="Description"
                        required
                        defaultValue={electrodeGroup.description}
                        placeholder="Description"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <DataListElement
                        id={`electrode_groups-targeted_location-${index}`}
                        name={`targeted_location-${index}`}
                        title="Targeted Location"
                        dataItems={locations()}
                        defaultValue={electrodeGroup.targeted_location}
                        onChange={(e) =>
                          itemSelected(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`electrode_groups-targeted_x-${index}`}
                        type="number"
                        name="targeted_x"
                        title="Targeted x"
                        required
                        defaultValue={electrodeGroup.targeted_x}
                        placeholder="Targeted x"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`electrode_groups-targeted_y-${index}`}
                        type="number"
                        name="targeted_y"
                        title="Targeted y"
                        required
                        defaultValue={electrodeGroup.targeted_y}
                        placeholder="Targeted y"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <InputElement
                        id={`electrode_groups-targeted_z-${index}`}
                        type="number"
                        name="targeted_z"
                        title="Targeted z"
                        required
                        defaultValue={electrodeGroup.targeted_z}
                        placeholder="Targeted z"
                        onBlur={(e) =>
                          onBlur(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <SelectElement
                        id={`electrode_groups-units-${index}`}
                        name="units"
                        title="Units"
                        defaultValue={electrodeGroup.units}
                        dataItems={units()}
                        onChange={(e) =>
                          itemSelected(e, {
                            key,
                            index,
                          })
                        }
                      />
                      <div
                        className={`${nTrodeItems.length > 0 ? '' : 'hide'}`}
                      >
                        <ChannelMap
                          title="Ntrode"
                          electrodeGroupId={electrodeGroupId}
                          nTrodeItems={nTrodeItems}
                          updateFormData={updateFormData}
                          onBlur={(e) =>
                            onBlur(e, {
                              key: 'ntrode_electrode_group_channel_map',
                              name: 'map',
                              index,
                            })
                          }
                          onMapInput={onMapInput}
                        />
                      </div>
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <ArrayUpdateMenu
              itemsKey="electrode_groups"
              allowMultiple
              items={formData.electrode_groups}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
            />
          </fieldset>
        </div>

        <div className="submit-button-parent">
          <button
            type="submit"
            className="submit-button"
            title="Generate a YML file based on values in fields"
          >
            <span>Generate YML File</span>
          </button>
        </div>
      </form>
    </>
  );
}

export default YMLGenerator;
