  var projectSaveFallback=false,projectSaveBusy=false;
  function projectFilename(){var name=$('projectName').value.trim().replace(/\.json$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'');return(name||'hofmann-trace-project')+'.json';}
  function syncSaveDialog(){
    var native=typeof window.showSaveFilePicker==='function'&&window.isSecureContext&&!projectSaveFallback;
    $('saveProjectConfirm').textContent=native?'Choose location…':'Download project';
    $('saveProjectHint').textContent=native?'Choose the file name and folder in the next window.':'The file will use this name. The download folder is controlled by your browser; enable “Ask where to save” in its download settings to choose a folder.';
    return native;
  }
  function openProjectSave(){finishPaint(true);finishControlEdit();closeSizePopup(true);syncSaveDialog();$('saveProjectDlg').showModal();}
  $('saveProjectCancel').addEventListener('click',function(){$('saveProjectDlg').close();});
  $('saveProjectForm').addEventListener('submit',async function(e){
    e.preventDefault();if(projectSaveBusy)return;projectSaveBusy=true;$('saveProjectConfirm').disabled=true;
    var name=projectFilename(),handle;
    try{
      // Invoke the system picker while this button still has user activation.
      if(syncSaveDialog())handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Hofmann Trace project',accept:{'application/json':['.json']}}]});
      await whenIdle();var data=projectJson();
      if(handle){var writable=await handle.createWritable();try{await writable.write(new Blob([data],{type:'application/json'}));await writable.close();}catch(err){try{await writable.abort();}catch(ignore){}throw err;}setStatus('Project saved — '+handle.name+'.');}
      else saveFile(name,data);
      $('saveProjectDlg').close();
    }catch(err){
      if(err.name==='AbortError')setStatus('Save cancelled.');
      else{projectSaveFallback=true;syncSaveDialog();$('saveProjectHint').textContent='The browser could not save to that location. You can download the named project instead.';}
    }finally{projectSaveBusy=false;$('saveProjectConfirm').disabled=false;}
  });
