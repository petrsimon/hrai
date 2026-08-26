import projectData from './project-data';
import {TranslatorFunction} from '../../gui-config';


import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import meowWav from '!arraybuffer-loader!./83c36d806dc92327b9e7049a565c6bff.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
import costumeIdle from '!arraybuffer-loader!../../../static/hrai/sprites/dragon-idle.png?';
import costumeFlyUp from '!arraybuffer-loader!../../../static/hrai/sprites/dragon-fly-up.png?';
import costumeFire from '!arraybuffer-loader!../../../static/hrai/sprites/dragon-fire.png?';
import costumeFlyDown from '!arraybuffer-loader!../../../static/hrai/sprites/dragon-fly-down.png?';


declare function require (path: 'fastestsmallesttextencoderdecoder'): {TextEncoder: typeof TextEncoder};

const defaultProject = (translator?: TranslatorFunction) => {
    let _TextEncoder: typeof TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('fastestsmallesttextencoderdecoder').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();

    const projectJson = projectData(translator);
    return [{
        // TODO: This is weird - the ids are annotated by scratch-storage to be strigns, but
        //       this one is an int. May have implications on checking with `!` and in conditions,
        //       so leaving it as is for now.
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: '83a9787d4cb6f3b7632b4ddfebf74367',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(popWav)
    }, {
        id: '83c36d806dc92327b9e7049a565c6bff',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(meowWav)
    }, {
        id: 'cd21514d0531fdffb22204e0ec5ed84a',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        id: '7f91a8cc4db049d193145cda079a510f',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costumeIdle)
    }, {
        id: '42217ca144971f0aa71196ebedec7b80',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costumeFlyUp)
    }, {
        id: '855d408d8dc17bad4865480447674fc9',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costumeFire)
    }, {
        id: '4375d2db113110fd1b242e50da526496',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costumeFlyDown)
    }];
};

export default defaultProject;
