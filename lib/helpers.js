'use strict';

const { DataTypes } = require('sequelize');

const buildOpenAPI3Base = (configuration) => {
    const baseObject = {};
    baseObject.openapi = '3.0.1';
    baseObject.info = configuration.info || {};
    baseObject.servers = configuration.servers || {};
    baseObject.tags = configuration.tags || {};
    baseObject.paths = configuration.paths || {};
    baseObject.components = configuration.components || {};
    return baseObject;
}
/**
 * Converts Sequelize model property to OpenAPI 2.0 property
 * @function
 * @param {object} property - Sequelize model property
 * @returns {object} OpenAPI 2.0 property
 * @requires Sequelize.DataTypes
 */
const constructProperty = (property) => {
    const {
        type,
        allowNull,
        primaryKey,
    } = property;
    const prop = {
        nullable: allowNull === true,
        readOnly: primaryKey === true,
    };

    // # IPv4 with CIDR
    const ipv4 = '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(/(3[0-2]|2[0-9]|1[0-9]|[0-9]))?$';
    // # IPv6 with CIDR
    const ipv6 = '^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(\/((1(1[0-9]|2[0-8]))|([0-9][0-9])|([0-9])))?$';
    // # Host Name
	const hostname = '^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$';
	
	if (!(DataTypes[type.constructor.name] || typeof DataTypes[type.constructor.name] === 'function')) {
		// TODO: Process custom model type definitions
		return {};
    }
    if (type.constructor.name === 'ABSTRACT') {
        prop.type = 'object';
    }
    if (type.constructor.name === 'ARRAY') {
        const subtype = constructProperty({
            type: type.type,
        })
        prop.type = 'array';
        prop.items = subtype;
    }
    if (type.constructor.name === 'BIGINT') {
        prop.type = 'integer';
        prop.format = 'int64';
    }
    if (type.constructor.name === 'BLOB') {
        prop.type = 'string';
        prop.format = 'binary';
    }
    if (type.constructor.name === 'BOOLEAN') {
        prop.type = 'boolean';
    }
    if (type.constructor.name === 'CHAR') {
        prop.type = 'string';
        prop.maxLength = type._length;
    }
    if (type.constructor.name === 'CIDR') {
        prop.type = 'string';
        prop.pattern = `((${ipv4}) | (${ipv6}) | (${hostname}))`;
    }
    if (type.constructor.name === 'CITEXT') {
        prop.type = 'string';
        prop.maxLength = type.options.length ? type._length : undefined;
    }
    if (type.constructor.name === 'DATE') {
        prop.type = 'string';
        prop.format = 'date-time';
    }
    if (type.constructor.name === 'DATEONLY') {
        prop.type = 'string';
        prop.format = 'date';
    }
    if (type.constructor.name === 'DECIMAL') {
        prop.type = 'number';
        prop.format = 'float';
    }
    if (type.constructor.name === 'DOUBLE') {
        prop.type = 'number';
        prop.format = 'double';
    }
    if (type.constructor.name === 'ENUM') {
        prop.type = 'string';
        prop.enum = type.values;
    }
    if (type.constructor.name === 'FLOAT') {
        prop.type = 'number';
        prop.format = 'float';
    }
    if (type.constructor.name === 'GEOGRAPHY') {
        prop.type = 'string';
    }
    if (type.constructor.name === 'GEOMETRY') {
        prop.type = 'object';
        prop.required = [
            'type',
            'coordinates',
        ];
        prop.properties = {
            crs: {
                type: 'object',
            },
            coordinates: {
                type: 'array',
                items: 'number',
            },
            type: {
                type: 'string',
                enum: [
                    'Unknown',
                    'Point',
                    'Multipoint',
                    'Polyline',
                    'Polygon',
                    'Envelop',
                ]
            }
        };
    }
    if (type.constructor.name === 'HSTORE') {
        prop.type = 'object';
    }
    if (type.constructor.name === 'INET') {
        const inet = '([0-9]{1,3}\.){3}[0-9]{1,3}';
        prop.type = 'string';
        prop.pattern = `((${ipv4} ? ${inet}) | (${ipv6} ? ${inet}) | (${hostname} ? ${inet}))`;
    }
    if (type.constructor.name === 'INTEGER') {
        prop.type = 'integer';
        prop.format = 'int32';
    }
    if (type.constructor.name === 'JSON') {
        prop.type = 'object';
    }
    if (type.constructor.name === 'JSONB') {
        prop.type = 'object';
    }
    if (type.constructor.name === 'MACADDR') {
        prop.type = 'string';
        prop.format = 'mac';
    }
    if (type.constructor.name === 'MEDIUMINT') {
        prop.type = 'integer';
        prop.format = 'int24';
    }
    if (type.constructor.name === 'NOW') {
        prop.type = 'integer';
        prop.format = 'int32';
    }
    if (type.constructor.name === 'NUMBER') {
        prop.type = 'number';
    }
    if (type.constructor.name === 'RANGE') {
        const subtype = constructProperty({
            type: type.options.subtype,
        })
        prop.type = subtype.type;
    }
    if (type.constructor.name === 'REAL') {
        prop.type = 'number';
        prop.format = 'float';
    }
    if (type.constructor.name === 'SMALLINT') {
        prop.type = 'integer';
        prop.format = 'int16'
    }
    if (type.constructor.name === 'STRING') {
        prop.type = 'string';
        prop.maxLength = type._length;
    }
    if (type.constructor.name === 'TEXT') {
        prop.type = 'string';
        prop.maxLength = type.options.length ? type._length : undefined;
    }
    if (type.constructor.name === 'TIME') {
        prop.type = 'string';
        prop.format = 'partial-time';
    }
    if (type.constructor.name === 'TINYINT') {
        prop.type = 'integer';
        prop.format = 'int8'
    }
    if (type.constructor.name === 'UUID') {
        prop.type = 'string';
        prop.format = 'uuid';
    }
    if (type.constructor.name === 'UUIDV1') {
        prop.type = 'string';
        prop.format = 'uuidv1';
    }
    if (type.constructor.name === 'UUIDV4') {
        prop.type = 'string';
        prop.format = 'uuidv4';
    }
    if (type.constructor.name === 'VIRTUAL') {
        prop.type = 'object';
    }
    
    return prop;
};
/**
 * Generates a single OpenAPI 2.0 definition from Sequelize model
 * @function
 * @param {object} model - Sequelize model
 * @returns {object} OpenAPI 2.0 definition
 */
const constructRefModel = (model) => {
    const {
        rawAttributes,
    } = model;
    const refModel = Object.values(rawAttributes).reduce((accumulator, value) => {
        if (!(accumulator.required && accumulator.required.length)) {
            accumulator.required = [];
        }
        if (value.allowNull === false) {
            accumulator.required.push(value.fieldName);
        }

        accumulator.properties = {
            ...accumulator.properties,
            [value.fieldName]: constructProperty(value),
        };
        return accumulator;
    }, {});

    return {
        [model.name]: refModel
    };
};
/**
 * Generates the OpenAPI 2.0 definitions from Sequelize models
 * @function
 * @param {object} models - Sequelize models
 * @returns {object} OpenAPI 2.0 properties
 */
const buildFromSequelize = (models) => Object.values(models).reduce((accumulator, value) => {
    return { ...accumulator, ...constructRefModel(value) };
}, {});

module.exports = {
    buildFromSequelize,
    buildOpenAPI3Base,
};