import projectData from './project-data';
import {TranslatorFunction} from '../../gui-config';


import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import meowWav from '!arraybuffer-loader!./83c36d806dc92327b9e7049a565c6bff.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
import costume1 from '!arraybuffer-loader!../../../static/hrai/hrai-dragon-mark-256.png?';
import costume2 from '!arraybuffer-loader!../../../static/hrai/hrai-dragon-mark-256-flipped.png?';


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
        id: '4588e7e83273b7f3831be57b7cdcb7c3',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costume1)
    }, {
        id: '920e898fb4ff2716f9eb8a71d77f5346',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costume2)
    }];
};

export default defaultProject;
