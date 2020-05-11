/** @module index */
'use strict';

// Dependencies
const fs = require('fs');
const glob = require('glob');
const path = require('path');
// const parser = require('swagger-parser');
const helpers = require('./helpers');
const doctrineFile = require('doctrine-file');
const deepmerge = require('deepmerge');

const components = {
    schemas: {}
};

/**
 * Parses the provided API file for JSDoc comments.
 * @function
 * @param {string} file - File to be parsed
 * @returns {object} JSDoc comments
 * @requires doctrine
 */
const parseApiFile = (file) => {
    const content = fs.readFileSync(file, 'utf-8');
    return doctrineFile.parseFileContent(content, {unwrap: true, sloppy: true, tags: null, recoverable: true});
}

const parseRoute = (str) => {
    const split = str.split(" ");
    return {
        method: split[0].toLowerCase() || 'get',
        uri: split[1] || ''
    }
}

const parseReturn = (tags) => {
    let rets = {}
    let headers = parseHeaders(tags)

    for (let i in tags) {
        if (tags[i]['title'] == 'returns' || tags[i]['title'] == 'return') {
            let description = tags[i]['description'].split("-"), key = description[0].trim()

            rets[key] = {
                description: description[1] ? description[1].trim() : '',
                headers: headers[key]
            };
            const type = parseType(tags[i].type);
            if (type) {
                // rets[key].type = type;
                rets[key].schema = parseSchema(tags[i].type)
            }
        }
    }
    return rets
}

const parseDescription = (obj) => {
    const description = obj.description || '';
    const sanitizedDescription = description.replace('/**','');
    return sanitizedDescription;
}

const parseTag = (tags) => {
    for (let i in tags) {
        if (tags[i]['title'] == 'group') {
            return tags[i]['description'].split("-")
        }
    }
    return ['default', '']
}

const parseProduces = (str) => str.split(/\s+/);
const parseConsumes = (str) => str.split(/\s+/);
const parseSecurity = (comments) => {
    let security;
    try {
        security = JSON.parse(comments)
    } catch (e) {
        let obj = {}
        obj[comments] = []
        security = [
            obj
        ]
    }
    return security
}

const parseHeaders = (comments) => {
    const headers = {};
    for (let i in comments) {
        if (comments[i]['title'] === 'headers' || comments[i]['title'] === 'header') {

            let description = comments[i]['description'].split(/\s+-\s+/)

            if (description.length < 1) {
                break
            }
            let code2name = description[0].split(".")

            if (code2name.length < 2) {
                break
            }

            let type = code2name[0].match(/\w+/)
            let code = code2name[0].match(/\d+/)

            if (!type || !code) {
                break;
            }
            let code0 = code[0].trim();
            if (!headers[code0]) {
                headers[code0] = {}
            }

            headers[code0][code2name[1]] = {
                type: type[0],
                description: description[1]
            }
        }
    }
    return headers
}

const isRegExp = (string) => {
    try {
        return Function(`
            "use strict";
            try {
                new RegExp(${string});
                return true;
            } catch (e) {
                return false;
            }
        `)();
    } catch(e) {
        return false;
    }
};

const simpleNameExpressions = [
    'string',
    'number',
    'integer',
    'boolean'
];

const typeConstructors = {
    StringLiteralType: (type, field, options, applications) => constructStringLiteralType(type, field, options, applications),
    NameExpression: (type, field, options, applications) => constructNameExpression(type, field, options, applications),
    Array: (type, field, options, applications) => constructArray(type, field, options, applications),
    Object: (type, field, options, applications) => constructObject(type, field, options, applications),
    Enum: (type, field, options, applications) => constructEnum(type, field, options, applications),
    Date: (type, field, options, applications) => constructDate(type, field, options, applications),
    File: (type, field, options, applications) => constructFile(type, field, options, applications),
    OptionalType: (type, field, options, applications) => constructOptionalType(type, field, options, applications),
    TypeApplication: (type, field, options, applications) => constructTypeApplication(type, field, options, applications),
    UnionType: (type, field, options, applications) => constructUnionType(type, field, options, applications),
    AllLiteral: () => constructAllLiteral(),
};

const constructStringLiteralType = (type) => type.value;

const constructNameExpression = (type, field, options, applications) => {
    const prop = {};
    if (simpleNameExpressions.includes(type.name)) {
        if (applications && applications.length && type.name === 'string') {
            const props = applications.map((application) => {
                const formatOrPatternString = constructPropertyType(application, field, options);
                const formatOrPattern = isRegExp(formatOrPatternString) ? 'pattern' : 'format';
                return {
                    type: type.name,
                    [formatOrPattern]: formatOrPatternString,
                };
            });
            if (applications.length === 1) return props[0];
            prop.oneOf = props;
            return prop;
        }
        prop.type = type.name;
        return prop;
    }
    if (!(typeof typeConstructors[type.name] === 'undefined')) {
        return typeConstructors[type.name](type, field, options, applications);
    }
    const model = type.name.split('.')[0];
    const modelProperty = type.name.split('.')[1];
    if (model && typeof components.schemas[model] === 'undefined') {
        throw new Error(`Property "${field}" refers to an undefined model "${model}"`);
    }
    if (modelProperty && typeof components.schemas[model].properties[modelProperty] === 'undefined') {
        throw new Error(`Property "${field}" refers to an undefined property "${modelProperty}" of model "${model}"`);
    }
    prop.$ref = modelProperty ? `#/components/schemas/${model}/properties/${modelProperty}` : `#/components/schemas/${model}`;
    return prop;
};

const constructArray = (type, field, options, applications) => {
    const prop = {};
    const arrayItems = applications.reduce((accumulator, application) => {
        accumulator = constructPropertyType(application, field, options)
        return accumulator;
    }, {});
    prop.type = 'array';
    prop.items = arrayItems;
    return prop;
};

const constructObject = (type, field, options, applications) => {
    const prop = {};
    const properties = applications.reduce((accumulator, application) => {
        const propertyName = application.expression.name;
        accumulator[propertyName] = application.applications.reduce((acc, a) => {
            acc = constructPropertyType(a, field, options);
            return acc;
        }, {});
        return accumulator;
    }, {});
    prop.type = 'object';
    prop.properties = properties;
    return prop;
};

const constructEnum = (type, field, options, applications) => {
    const prop = {};
    prop.type = 'string';
    prop.enum = (applications && applications.length) ? applications.map((application) => constructPropertyType(application, field, options)) : (options.items || []);
    return prop;
};

const constructDate = (type, field, options, applications) => {
    const prop = {};
    if (applications && applications.length) {
        prop.anyOf = applications.map((application) => {
            return {
                type: 'string',
                format: constructPropertyType(application, field, options),
            }
        });
        return prop;
    } else {
        prop.type = 'string';
        if (options.format) prop.format = options.format;
        return prop;
    }
};

const constructFile = (type, field, options, applications) => {
    const prop = {};
    if (applications && applications.length) {
        const props = applications.map((application) => {
            return {
                type: 'string',
                format: constructPropertyType(application, field, options),
            }
        });
        if (applications.length === 1) return props[0];
        prop.oneOf = props;
        return prop;
    } else {
        prop.type = 'string';
        if (options.format) prop.format = options.format;
        return prop;
    }
};

const constructOptionalType = (type, field, options, applications) => {
    return {
        ...constructPropertyType(type.expression, field, options),
    }
};

const constructTypeApplication = (type, field, options, applications) => {
    return {
        ...constructPropertyType(type.expression, field, options, type.applications),
    }
};

const constructUnionType = (type, field, options, applications) => {
    let prop = {};
    const unionType = type.elements.reduce((accumulator, element) => {
        if (element.type === 'NullLiteral') {
            accumulator.nullable = true;
        } else {
            accumulator.elements.push(element);
        }
        return accumulator;
    }, { elements: [], nullable: false });
    if (unionType.elements.length > 1) {
        prop = {
            anyOf: unionType.elements.map((element) => constructPropertyType(element, field, options)),
        };
    } else {
        prop = {
            ...constructPropertyType(unionType.elements[0], field, options),
        };
    }
    prop.nullable = unionType.nullable;
    return prop;
};

const constructAllLiteral = () => {
    return {
        nullable: true,
        anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'integer' },
            { type: 'boolean' },
            { type: 'array', items: {} },
            { type: 'object' }
        ],
    };
};

const constructPropertyType = (type, field = undefined, options = undefined, applications = undefined) => {
    console.log(`\x1b[32m(${field} - Options: ) \x1b[31m%s\x1b[0m`, JSON.stringify(options, null, 2))
    return typeConstructors[type.type](type, field, options, applications);
};

const keywordsObject = {
    in: (value) => {
        if (['query', 'path', 'body', 'headers'].includes(value)) {
            return value;
        }
        throw new Error(`Invalid value "${value}" of parameter "in"`)
    },
    description: (value) => (value),
    not: (value) => {return {...value}},
    deprecated: () => true,
    discriminator: (value) => (value),
    example: (value) => (value),
    externalDocs: (value) => (value),
    nullable: (value) => typeof value === 'undefined' ? true : value === 'true',
    readOnly: (value) => typeof value === 'undefined' ? true : value === 'true',
    writeOnly: (value) => typeof value === 'undefined' ? true : value === 'true',
    xml: (value) => (value),
    required: (value) => JSON.parse(value.replace('\'', '"')),
    oneOf: (value) => {return [...value]},
    allOf: (value) => {return [...value]},
    anyOf: (value) => {return [...value]},
};
const keywordsParameter = {
    title: (value) => (value),
    format: (value) => (value),
    pattern: (value) => (value),
    enum: (value) => JSON.parse(value.replace(/[']/g, '"')),
    minimum: (value) => new Number(value).valueOf(),
    maximum: (value) => new Number(value).valueOf(),
    exclusiveMinimum: (value) => typeof value === 'undefined' ? true : value === 'true',
    exclusiveMaximum: (value) => typeof value === 'undefined' ? true : value === 'true',
    multipleOf: (value) => new Number(value).valueOf(),
    minLength: (value) => new Number(value).valueOf().toFixed(),
    maxLength: (value) => new Number(value).valueOf().toFixed(),
    minItems: (value) => new Number(value).valueOf().toFixed(),
    maxItems: (value) => new Number(value).valueOf().toFixed(),
    uniqueItems: (value) => typeof value === 'undefined' ? true : value === 'true',
    minProperties: (value) => new Number(value).valueOf().toFixed(),
    maxProperties: (value) => new Number(value).valueOf().toFixed(),
};

const constructOptions = (store, level = undefined) => {
    let levelStore = {};
    /**
     * Multiple option variants on the 'undefined' level
     * falls back to anyOf[] by default
     */
    const levelKey = level || 'anyOf';

    for (const key in store) {
        if (key === 'level') continue;
        const option = store[key];
        if (!(typeof keywordsParameter[key] === 'undefined')) {
            if (level) {
                levelStore[levelKey] = (typeof levelStore[levelKey] === 'undefined') ? [] : [ ...levelStore[levelKey] ];
                option.map((variant) => levelStore[levelKey].push({ [key]: variant }));
                continue;
            }
            if (option.length === 1) {
                levelStore[key] = option[0];
                continue;
            } else {
                levelStore[levelKey] = (typeof levelStore[levelKey] === 'undefined') ? [] : [ ...levelStore[levelKey] ];
                option.map((variant) => levelStore[levelKey].push({ [key]: variant }));
                continue;
            }
        }
        if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
            levelStore[key] = constructOptions(option, key)[key];
            continue;
        }
        if (key === 'not') {
            levelStore[key] = constructOptions(option);
            continue
        }
        levelStore[key] = keywordsObject[key](option);
    }
    return levelStore;
}

const optionsReducer = (description) => {
    const separator = '~~~';
    const optionsRegExp = new RegExp(/([\n]{1}[\s]*[-]{1}[\s]*)/, 'gm');
    const rawOptions = description.replace(optionsRegExp, separator);
    const optionsArray = rawOptions.split(separator);
    const optionKeyRegExp = new RegExp(/(^[a-zA-Z0-9]*:{1})/, 'm');
    return optionsArray.reduce((accumulator, option) => {
        let [ key, value ] = option.split(optionKeyRegExp).filter((value) => !(value === ''));
        if (optionKeyRegExp.test(key)) {
            key = key.replace(/[:]$/, '');
            value = value ? value.trim() : undefined;
        }
        if (!(typeof keywordsObject[key] === 'undefined')) {
            // It is an object yet, because we need key variations there
            if (['not', 'allOf', 'anyOf', 'oneOf'].includes(key)) {
                accumulator[key] = {};
                accumulator.level = key;
            } else {
                accumulator[key] = value;
            }
            return accumulator;
        }
        // Building type parameters (e.g. format, minLength, ...)
        if (!(typeof keywordsParameter[key] === 'undefined')) {
            if (typeof accumulator.level === 'undefined') {
                accumulator[key] = (typeof accumulator[key] === 'undefined') ? [keywordsParameter[key](value)] : [keywordsParameter[key](value), ...accumulator[key]];
                return accumulator;
            }
            if (['allOf', 'anyOf', 'oneOf', 'not'].includes(accumulator.level)) {
                accumulator[accumulator.level][key] = (typeof accumulator[accumulator.level][key] === 'undefined') ? [keywordsParameter[key](value)] : [keywordsParameter[key](value), ...accumulator[accumulator.level][key]];
            }
            return accumulator;
        }
        // Everything else is a description
        value = key;
        key = 'description';
        accumulator[key] = value;
        return accumulator;
    }, {
        level: undefined,
    });
};

const constructProperty = (param) => {
    const {
        description,
        type,
        name,
    } = param;

    const [
        $in,
        field,
    ] = name.split('.');

    console.log($in, field)

    const options = constructOptions(optionsReducer(description));

    if (!['query', 'path', 'body', 'headers'].includes($in) || typeof $in === 'undefined') {
        throw new Error(`\x1b[31mValid request payload type for the parameter \x1b[33m"${field}"\x1b[31m must be provided. Valid types are: \x1b[33mquery, path, body, headers\x1b[31m. Type \x1b[33m"${$in}"\x1b[31m provided\x1b[0m`);
    }

    return {
        property: {[field]: constructPropertyType(type, field, options)},
        required: !(type.type === 'OptionalType'),
        in: $in,
    };
};

const fileFormat = (comments) => {
    let route;
    const paths = {};
    const parameters = [];
    const properties = {};
    const tags = [];
    const desc = parseDescription(comments);
    console.log(Date.now())

    // Type definitions first
    // for (const i in comments) {
    //     if (i === 'tags') {
    //         if (comments[i].length > 0 && comments[i][0]['title'] && comments[i][0]['title'] === 'typedef') {
    //             const {
    //                 typeName,
    //                 details,
    //             } = parseTypedef(comments[i]);
    //             components.schemas[typeName] = details;
    //         }
    //     }
    // }
    // Parameters
    for (const i in comments) {
        console.log(i)
        if (i === 'tags') {
            for (const j in comments[i]) {

                const title = comments[i][j]['title'];
                if (title === 'route') {
                    route = parseRoute(comments[i][j]['description']);
                    const tag = parseTag(comments[i]);
                    const currentMethod = {
                        [route.method]: {
                            tags: [
                                tag[0].trim(),
                            ],
                            parameters: [],
                            requestBody: {
                                description: desc,
                                content: {}
                            }
                        }
                    };
                    paths[route.uri] = {
                        ...paths[route.uri],
                        ...currentMethod,
                    };
                    tags.push({
                        name: typeof tag[0] === 'string' ? tag[0].trim() : '',
                        description: typeof tag[1] === 'string' ? tag[1].trim() : '',
                    });
                }
                if (title === 'param' && route) {

                    const property = constructProperty(comments[i][j]);
                    console.log(`\x1b[32m(Property ) \x1b[33m%s\x1b[0m`, JSON.stringify(property, null, 2))

                    // console.log(JSON.stringify(comments[i][j]));
                    // console.log(property);

                    // if ($in === 'body') {

                    // } else {
                    //     const parameter = {
                    //         // description,
                    //         name: field,
                    //         // in: $in,
                    //         // required: isRequired,
                    //         // schema: propertyType,
                    //     };
                    //     parameters.push(parameter);
                    // }

                    
                    // const schema = parseSchema(comments[i][j]['type'])
                    // // we only want a type if there is no referenced schema
                    // if (!schema) {
                    //     properties.type = parseType(comments[i][j]['type']);
                    //     if (properties.type == 'enum') {
                    //         const parsedEnum = parseEnums(comments[i][j]['description']);
                    //         properties.type = parsedEnum.type;
                    //         properties.enum = parsedEnum.enums;
                    //     }
                    // } else {
                    //     properties.schema = schema;
                    //     params.push(properties);
                    // }
                }

                if (title === 'operationId' && route) {
                    // paths[route.uri][route.method]['operationId'] = comments[i][j]['description'];
                }

                if (title === 'summary' && route) {
                    // paths[route.uri][route.method]['summary'] = comments[i][j]['description'];
                }

                if (title === 'produces' && route) {
                    // paths[route.uri][route.method]['produces'] = parseProduces(comments[i][j]['description']);
                }

                if (title === 'security' && route) {
                    // paths[route.uri][route.method]['security'] = parseSecurity(comments[i][j]['description'])
                }

                if (title === 'deprecated' && route) {
                    // paths[route.uri][route.method]['deprecated'] = true;
                }

                if (route) {
                    // paths[route.uri][route.method]['parameters'] = params;
                    // paths[route.uri][route.method]['responses'] = parseReturn(comments[i]);
                }
            }
        }
    }
    return {
        paths,
        tags,
        components,
    }
}

/**
 * Filters JSDoc comments
 * @function
 * @param {object} jsDocComments - JSDoc comments
 * @returns {object} JSDoc comments
 * @requires js-yaml
 */
const filterJsDocComments = (jsDocComments) => jsDocComments.filter((item) => item.tags.length > 0);

/**
 * Converts an array of globs to full paths
 * @function
 * @param {array} globs - Array of globs and/or normal paths
 * @return {array} Array of fully-qualified paths
 * @requires glob
 */
const convertGlobPaths = (base, globs) => globs.reduce((acc, globString) => {
    const globFiles = glob.sync(path.resolve(base, globString));
    return acc.concat(globFiles);
}, []);
/**
 * Generates the swagger spec
 * @function
 * @param {object} options - Configuration options
 * @returns {array} Swagger spec
 * @requires swagger-parser
 * @requires Sequelize.Model
 */
const generateSpecAndMount = (models, options) => {
    /* istanbul ignore if */
    if (!options) {
        throw new Error('\'options\' is required.');
    } else /* istanbul ignore if */ if (!options.openAPI3Definition) {
        throw new Error('\'openAPI3Definition\' is required.');
    } else /* istanbul ignore if */ if (!options.files) {
        throw new Error('\'files\' is required.');
    }
    /* istanbul ignore if */
    if (!models) {
        throw new Error('\'models\' is required.');
    }
    // Build basic swagger json
    const openapiObject = helpers.buildOpenAPI3Base(options.openAPI3Definition);
    const apiFiles = convertGlobPaths(options.basedir, options.files);

    // Building definitions from Sequelize models at first, we have to know types before building paths
    components.schemas = {
        ...components.schemas,
        ...helpers.buildFromSequelize(models),
    }

    openapiObject.components.schemas = components.schemas;

    // Parse the documentation in the APIs array.
    for (let i = 0; i < apiFiles.length; i = i + 1) {
        const parsedFile = parseApiFile(apiFiles[i]);
        const comments = filterJsDocComments(parsedFile);

        for (const j in comments) {
            try {
                const {
                    paths,
                    tags,
                    components,
                } = fileFormat(comments[j]);
                openapiObject.paths = deepmerge(openapiObject.paths, paths);
            } catch (e) {
                console.error(e);
                // console.log(`Incorrect comment format. Method was not documented.\nFile: ${apiFiles[i]}\nComment:`, comments[j])
            }
        }
    }

    // console.log('\x1b[31m%s\x1b[0m', JSON.stringify(openapiObject.paths, null, 4));

    // console.log(openapiObject);

    // parser.parse(swaggerObject, function (error, api) {
    //     if (error) {
    //         console.error('\x1b[31m%s\x1b[0m', 'Swagger definition is invalid', error);
    //         throw error;
    //     }
    //     swaggerObject = api;
    // });

    // let definition = JSON.parse(JSON.stringify(swaggerObject));

    // parser.validate(definition, (error, api) => {
    //     if (error) {
    //         console.error('\x1b[31m%s\x1b[0m', 'Swagger definition is invalid', error);
    //         // throw error;
    //     }
    // });

    return openapiObject;
};


module.exports = {
    generateSpecAndMount,
    fileFormat,
    parseApiFile
};
