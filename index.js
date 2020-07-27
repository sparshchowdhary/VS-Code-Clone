const $=jQuery=require('jquery');
require('jstree');//plugin for tree view
require('jquery-ui-dist/jquery-ui'); //we use jquery-ui-dist as normal jquery ui is not working properly
const nodePath=require('path');
const fs=require('fs');
const fsp = require("fs").promises;
let os=require('os');
let pty=require('node-pty');
const electron = require("electron").remote;
const dialog = electron.dialog;
let Terminal=require('xterm').Terminal;
const {FitAddon}=require('xterm-addon-fit');

let currentPath;
let db;//acts as database
let editor;
let lastClosedTab=[];
let lastClosedFolder;
let defaultValue="";
let defaultName="untitled";
let fileData;

$(document).ready(async function(){
    
    //******** This code is taken from renderer.js from gitlink of node-pty *****************
    const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'];
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: process.env
    });
    
    // Initialize xterm.js and attach it to the DOM
    const xterm = new Terminal({
        fontSize: 12
    });
    xterm.setOption('theme',{
        background:'#764ba2',
        foregound:'white'
    });
    const fitAddon=new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(document.getElementById('terminal'));
    fitAddon.fit();
    // Setup communication between xterm.js and node-pty
    xterm.onData(data => ptyProcess.write(data));
    ptyProcess.on('data', function (data) {
      xterm.write(data);
    });
    //***************************************************************************************
    
    editor=await createEditor();
    
    //~~~~~~~~~~~~~~~~~~~ Tab Work ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    let tabs=$('#tabs').tabs({ //.tabs is inbuilt fn of jquery
       collapsible:true,
       active:false,
       heightStyle:"fill"
    });
    tabs.on("click",".ui-icon-close",function(){ //close tab
        if(lastClosedTab.length<=1){
            return;
        }
        let panelId=parseInt($(this).closest('li').remove().attr('aria-controls'));
        $('#'+panelId).remove();
        tabs.tabs('refresh');
        
        let i=lastClosedTab.indexOf(panelId);
        if(lastClosedTab[lastClosedTab.length-1]==panelId){
            let newTabId=lastClosedTab[lastClosedTab.length-2];
            editor.setValue(db[newTabId].data);
        }
        lastClosedTab.splice(i,1);
        delete db[panelId];
        //window.event.stopImmediatePropagation();
    });
    tabs.on('click','.ui-tabs-tab',function(){ //open tab
       $('.ui-tabs-tab').attr('aria-selected',false);
       if($(window.event.srcElement).hasClass('ui-icon-close')){ //handle event bubbling
           return;
       }
       let tabId=parseInt($(this).find('a').attr('href').substr(1));
       editor.setValue(db[tabId].data);
       let ti=lastClosedTab.indexOf(tabId);
       if(ti!=-1){
           lastClosedTab.splice(ti,1);
       }
       lastClosedTab.push(tabId);
    })
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    editor.onDidBlurEditorText(function(){ //inbuilt function of monaco editor
       let lastTab=lastClosedTab[lastClosedTab.length-1];
       db[lastTab].data=editor.getValue();
    });
    db={};//object initialization
    openFile();

    currentPath=process.argv[6].split("=")[1];
    lastClosedFolder=currentPath;

    let data=[];//store paths
    data.push({
        id:currentPath,
        parent:'#',
        text:getName(currentPath)//it's a function made to extract path
    });

    data=data.concat(getCurrentDirectories(currentPath));

    $('#tree-view').jstree({
        "core":{
            "check_callback":true,
            "data":data,
            "themes":{
                'icons':false
            }
        }
    }).on('open_node.jstree',function(e,data){
        data.node.children.forEach(function(child){
           let directories=getCurrentDirectories(child);
           directories.forEach(function(directory){
              let temp=$("#tree-view").jstree().create_node(child,directory,"last");
           })
        })
        lastClosedFolder=data.node.id;
    }).on('changed.jstree',function(e,data){
        if(fs.lstatSync(data.selected[0]).isFile()){
            openFile(data.selected[0]);
        }
    });
    
    $("#new").on("click",function(){
        openFile(); 
    });

    $("#save").on("click", async function () {
        let dobj=await dialog.showSaveDialog();
        let selectedFile=$('#tree-view').jstree('get_selected',true)[0].id;
        let extn=selectedFile.split('.')[1];
        let fn=dobj.filePath+`.${extn}`
        await fsp.writeFile(fn, fileData);
        alert("File saved successfully");
    });

    $("#open").on("click", function(){
        dialog.showOpenDialog({
            properties: ['openFile']
        }).then(result => {
            let fpath=result.filePaths[0];
            openFile(fpath);
        }).catch(err => {
            console.log(err)
        })
    })
    
    function openFile(path){
        let fileName=(path===undefined)?defaultName:getName(path);
        let tabId=Object.keys(db).length+1;
        lastClosedTab.push(tabId)
        
        //copied from tabs in jquery
        let tabTemplate="<li><a href='#{href}'>#{label}</a> <span class='ui-icon ui-icon-close' role='presentation'>Remove Tab</span></li>";
        let li = $( tabTemplate.replace( /#\{href\}/g, "#" + tabId ).replace( /#\{label\}/g, fileName ) );
        tabs.find('.ui-tabs-nav').append(li);
        tabs.append("<div id='" + tabId + "'></div>");
        tabs.tabs("refresh");
        let fileData=(path===undefined)?updateEditor():updateEditor(path);
        db[tabId]={
            path:path===undefined?"new":path,
            data:fileData
        };
    }

    function updateEditor(path){
        if(path===undefined){
            editor.setValue(defaultValue);
            monaco.editor.setModelLanguage(editor.getModel(),"javascript");
            return defaultValue;
        }
        fileData=fs.readFileSync(path).toString();
        editor.setValue(fileData);
        let fileExtension=getName(path).split('.')[1];
        if(fileExtension==='js'){ //handle for javascript
            fileExtension='javascript';
        }
        monaco.editor.setModelLanguage(editor.getModel(),fileExtension);//to set language in editor ccording to type of file
        return fileData;
    }

})

function getName(path){
    return path.replace(/^.*[\\\/]/,'');//regex
}

function getCurrentDirectories(path){
    if(fs.lstatSync(path).isFile()){
        return [];
    }
    let files=fs.readdirSync(path);
    let rv=[];
    for(let i=0;i<files.length;i++){
        let file=files[i];
        rv.push({
            id:nodePath.join(path,file),
            parent:path,
            text:file
        })
    }
    return rv;
}

//require of monaco editor overrides require of node
function createEditor(){
    return new Promise(function(resolve,reject){
        let monacoLoader=require("./node_modules/monaco-editor/min/vs/loader.js");
        monacoLoader.require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' }});
        monacoLoader.require(['vs/editor/editor.main'], function() {
            monaco.editor.defineTheme('myTheme',{
                base:'vs-dark',
                inherit:true,
                rules:[{background:'#1e2024'}],
                'colors':{
                    'editor.foreground':'#F8F8F8',
                    'editor.background':'#1e2024',
                    'editor.selectionBackground':'#DDF0FF33',
                    'editor.lineHighlightBackground': '#FFFFFF08',
                    'editorCursor.foreground': '#A7A7A7',
                    'editorWhitespace.foreground': '#FFFFFF40'
                }
            });
            monaco.editor.setTheme('myTheme');
            var editor = monaco.editor.create(document.getElementById('editor'), {
                value: [].join('\n'),
                language: 'javascript',
                theme:'myTheme'
            });
            resolve(editor);//return editor object
        });
    })
}