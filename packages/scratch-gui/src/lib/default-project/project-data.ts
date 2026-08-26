import projectDataMessages from './messages';
import sharedMessages from '../shared-messages';
import {MessageObject, TranslatorFunction} from '../../gui-config';

const messages = {...projectDataMessages, ...sharedMessages};

// use the default message if a translation function is not passed
const defaultTranslator = (msgObj: MessageObject) => msgObj.defaultMessage;

/**
 * Generate a localized version of the default project
 * @param {function} translateFunction a function to use for translating the default names
 * @returns {object} the project data json for the default project
 */
const projectData = (translateFunction?: TranslatorFunction): object => {
    const translator = translateFunction || defaultTranslator;
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {
                    '`jEk@4|i[#Fk?(8x)AV.-my variable': [
                        translator(messages.variable),
                        0
                    ]
                },
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        name: translator(messages.backdrop, {index: 1}),
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [
                    {
                        assetId: '83a9787d4cb6f3b7632b4ddfebf74367',
                        name: translator(messages.pop),
                        dataFormat: 'wav',
                        format: '',
                        rate: 11025,
                        sampleCount: 258,
                        md5ext: '83a9787d4cb6f3b7632b4ddfebf74367.wav'
                    }
                ],
                volume: 100
            },
            {
                isStage: false,
                name: translator(messages.sprite, {index: 1}),
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: '7f91a8cc4db049d193145cda079a510f',
                        name: translator(messages.costume, {index: 1}),
                        bitmapResolution: 2,
                        md5ext: '7f91a8cc4db049d193145cda079a510f.png',
                        dataFormat: 'png',
                        rotationCenterX: 627,
                        rotationCenterY: 627
                    },
                    {
                        assetId: '42217ca144971f0aa71196ebedec7b80',
                        name: translator(messages.costume, {index: 2}),
                        bitmapResolution: 2,
                        md5ext: '42217ca144971f0aa71196ebedec7b80.png',
                        dataFormat: 'png',
                        rotationCenterX: 627,
                        rotationCenterY: 627
                    },
                    {
                        assetId: '855d408d8dc17bad4865480447674fc9',
                        name: translator(messages.costume, {index: 3}),
                        bitmapResolution: 2,
                        md5ext: '855d408d8dc17bad4865480447674fc9.png',
                        dataFormat: 'png',
                        rotationCenterX: 627,
                        rotationCenterY: 627
                    },
                    {
                        assetId: '4375d2db113110fd1b242e50da526496',
                        name: translator(messages.costume, {index: 4}),
                        bitmapResolution: 2,
                        md5ext: '4375d2db113110fd1b242e50da526496.png',
                        dataFormat: 'png',
                        rotationCenterX: 627,
                        rotationCenterY: 627
                    }
                ],
                sounds: [
                    {
                        assetId: '83c36d806dc92327b9e7049a565c6bff',
                        name: translator(messages.meow),
                        dataFormat: 'wav',
                        format: '',
                        rate: 22050,
                        sampleCount: 18688,
                        md5ext: '83c36d806dc92327b9e7049a565c6bff.wav'
                    }
                ],
                volume: 100,
                visible: true,
                x: 0,
                y: 0,
                size: 35,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        meta: {
            semver: '3.0.0',
            vm: '0.1.0',
            agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36' // eslint-disable-line @stylistic/max-len
        }
    });
};


export default projectData;
