const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const JSZip = require('jszip');

initializeApp();
updateControlsVisibility();

let videoList = [];
let hotspotsByVideo = {};
let currentVideoPath = null;
let isCreatingHotspot = false;
let tempHotspotIndex = null;
let isEditMode = true;
let editingHotspotIndex = null;
let selectedVideoIndex = null;
let selectedHotspotIndex = null;
let videoOptions = {};
let shouldAutoPlay = false;
let originalVideoWidth = 0;
let originalVideoHeight = 0;
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;


const importVideoBtn = document.getElementById('import-video');
const createHotspotBtn = document.getElementById('create-hotspot');
const toggleModeBtn = document.getElementById('toggle-mode');
const saveProjectBtn = document.getElementById('save-project');
const loadProjectBtn = document.getElementById('load-project');
const videoPlayer = document.getElementById('video-player');
const videoContainer = document.getElementById('video-container');
const hotspotOverlay = document.getElementById('hotspot-overlay');
const videoControls = document.getElementById('video-controls');
const playPauseBtn = document.getElementById('play-pause');
const timelineSlider = document.getElementById('timeline-slider');
const timestampDisplay = document.getElementById('timestamp-display');
const videoOptionsBtn = document.getElementById('video-options-btn');
const videoOptionsDialogue = document.getElementById('video-options-dialogue');
const playNextSelect = document.getElementById('play-next-select');
const loopCheckbox = document.getElementById('loop-checkbox');
const saveVideoOptionsBtn = document.getElementById('save-video-options');
const closeVideoOptionsBtn = document.getElementById('close-video-options');
const deleteHotspotBtn = document.getElementById('delete-hotspot');
const newProjectBtn = document.getElementById('new-project-btn');
const hotspotForm = document.getElementById("hotspot-form");
const dragHandle = document.getElementById("hotspot-drag-handle");
const exportBtn = document.getElementById('export-project');
const topMenuButtons = document.querySelectorAll('#top-menu button');
const btnContainer = document.getElementById('button-container');
document.getElementById('right-sidebar').style.textAlign = 'center';
document.getElementById('left-sidebar').style.textAlign = 'center';
deleteHotspotBtn.style.display = 'none';
videoOptionsBtn.classList.add('glow-on-hover');
topMenuButtons.forEach(button => {
    button.classList.add('glow-on-hover');
});
playPauseBtn.classList.add('glow-on-hover');


videoOptionsBtn.addEventListener('click', showVideoOptions);
saveVideoOptionsBtn.addEventListener('click', saveVideoOptions);
closeVideoOptionsBtn.addEventListener('click', closeVideoOptions);
videoPlayer.addEventListener('ended', handleVideoEnd);
document.addEventListener('fullscreenchange', updateControlsVisibility);
newProjectBtn.addEventListener('click', newProject);
dragHandle.addEventListener("mousedown", dragStart);
document.addEventListener("mousemove", drag);
document.addEventListener("mouseup", dragEnd);
document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
        renderHotspots();
        updateHotspotVisibility();
        handleFullscreenChange();
        handleVideoResize();
    }, 200);
});
importVideoBtn.addEventListener('click', () => {
    ipcRenderer.send('import-video');
});
toggleModeBtn.addEventListener('click', toggleMode);
saveProjectBtn.addEventListener('click', saveProject);
loadProjectBtn.addEventListener('click', loadProject);
exportBtn.addEventListener('click', exportProject);
videoPlayer.addEventListener('timeupdate', () => {
    updateTimelineSlider();
    updateHotspotVisibility();
        
    });
window.addEventListener('resize', handleResize);
videoPlayer.addEventListener('loadedmetadata', handleResize);
document.getElementById('hotspot-start-time').addEventListener('input', updateHotspotTimeRange);
document.getElementById('hotspot-end-time').addEventListener('input', updateHotspotTimeRange);
document.getElementById('play-pause').addEventListener('click', togglePlayPause);
window.addEventListener('resize', () => {
    const form = document.getElementById('hotspot-form');
    if (form.style.display !== 'none') {
        const videoRect = videoPlayer.getBoundingClientRect();
        const formRect = form.getBoundingClientRect();
        form.style.left = `${videoRect.left + (videoRect.width - formRect.width) / 2}px`;
        form.style.top = `${videoRect.top + (videoRect.height - formRect.height) / 2}px`;
    }
});
document.getElementById('right-sidebar').addEventListener('click', (event) => {
    const li = event.target.closest('li');
    if (li && li.dataset.index) {
        const index = parseInt(li.dataset.index, 10);
        if (!isNaN(index)) {
            selectHotspotInList(index);
        }
    }
});
videoPlayer.addEventListener('loadedmetadata', handleVideoResize);
window.addEventListener('resize', handleVideoResize);

document.getElementById('import-video').onclick = closeVideoOptions;
document.getElementById('create-hotspot').onclick = closeVideoOptions;
document.getElementById('toggle-mode').onclick = closeVideoOptions;
document.getElementById('save-project').onclick = closeVideoOptions;
document.getElementById('load-project').onclick = closeVideoOptions;
document.getElementById('new-project-btn').onclick = closeVideoOptions;
document.getElementById('export-project').onclick = closeVideoOptions;
playPauseBtn.addEventListener('click', closeVideoOptions);
document.getElementById('timeline-slider').onclick = closeVideoOptions;
document.getElementById('hotspot-form').onclick = closeVideoOptions;
document.getElementById('left-sidebar').onclick = closeVideoOptions;

document.getElementById('import-video').onclick = saveEditedHotspot;
document.getElementById('video-options-btn').onclick = saveEditedHotspot;
document.getElementById('toggle-mode').onclick = saveEditedHotspot;
document.getElementById('save-project').onclick = saveEditedHotspot;
document.getElementById('load-project').onclick = saveEditedHotspot;
document.getElementById('new-project-btn').onclick = saveEditedHotspot;
document.getElementById('export-project').onclick = saveEditedHotspot;
document.getElementById('play-pause').onclick = saveEditedHotspot;
document.getElementById('timeline-slider').onclick = saveEditedHotspot;
createHotspotBtn.addEventListener('click', () => {
    if (currentVideoPath && isEditMode) {
        if (!isCreatingHotspot) {
            const hotspotForm = document.getElementById('hotspot-form');
            if (hotspotForm.style.display === 'block') {
                saveEditedHotspot();
                hotspotForm.style.display = 'none';
                editingHotspotIndex = null;
                document.getElementById('delete-hotspot').style.display = 'none';
                setTimeout(() => {
                    activateHotspotCreation();
                }, 100);
            } else {
                activateHotspotCreation();
            }
        } else {
            deactivateHotspotCreation();
        }
    } else if (!isEditMode) {
        alert('Please switch to Edit Mode to create hotspots.');
    } else {
        alert('Please select a video first.');
    }
});


ipcRenderer.on('video-imported', (event, filePath) => {
    console.log('Video imported:', filePath);
    addVideoToList(filePath);
    displayVideo(filePath);
    updateVideoLinkDropdown();
});



function initializeApp() {
    setInterval(ensureControlsVisible, 1000);
}

function initializeVideoControls() {
    updatePlayPauseButton();
    playPauseBtn.style.display = 'block';

}

function addVideoToList(filePath) {
    videoList.push(filePath);
    if (!hotspotsByVideo[filePath]) {
        hotspotsByVideo[filePath] = [];
    }
    updateVideoListUI();
}

function updateVideoListUI() {
    const videoListElement = document.getElementById('video-list');
    videoListElement.innerHTML = '';
    videoList.forEach((video, index) => {
        const li = document.createElement('li');
        li.textContent = `Video ${index + 1}: ${path.basename(video)}`;
        li.addEventListener('click', () => {
            selectVideo(index);
            displayVideo(video);
        });
        if (index === selectedVideoIndex) {
            li.classList.add('selected');
        }
        videoListElement.appendChild(li);
    });
}

function updateVideoLinkDropdown() {
    const dropdown = document.getElementById('hotspot-video-link');
    dropdown.innerHTML = '<option value="">Select a video to link (optional)</option>';
    videoList.forEach((video, index) => {
        if (video !== currentVideoPath) {
            const option = document.createElement('option');
            option.value = video;
            option.textContent = `Video ${index + 1}: ${path.basename(video)}`;
            dropdown.appendChild(option);
        }
    });
}

function selectVideo(index) {
    selectedVideoIndex = index;
    updateVideoListUI();
}

function togglePlayPause() {
    if (videoPlayer.paused) {
        videoPlayer.play();
    } else {
        videoPlayer.pause();
    }
    updatePlayPauseButton();
}

function updatePlayPauseButton() {
    const playPauseBtn = document.getElementById('play-pause');
    playPauseBtn.textContent = videoPlayer.paused ? 'Play' : 'Pause';
}

function activateHotspotCreation() {

    isCreatingHotspot = true;
    videoContainer.style.cursor = 'crosshair';
    hotspotOverlay.style.pointerEvents = 'auto';
    hotspotOverlay.addEventListener('mousedown', startCreatingHotspot);
    createHotspotBtn.textContent = 'Cancel Hotspot Creation';
    resetHotspotForm();
    reinitializeTextInputs();
}

function deactivateHotspotCreation() {
    isCreatingHotspot = false;
    videoContainer.style.cursor = 'default';
    hotspotOverlay.style.pointerEvents = 'none';
    hotspotOverlay.removeEventListener('mousedown', startCreatingHotspot);
    createHotspotBtn.textContent = 'Create Hotspot';

    updateHotspotList(); 
    renderHotspots();
}

function startCreatingHotspot(event) {
    if (!isEditMode || !isCreatingHotspot) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = hotspotOverlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const scaleX = originalVideoWidth / rect.width;
    const scaleY = originalVideoHeight / rect.height;

    const newHotspot = {
        x: x * scaleX,
        y: y * scaleY,
        width: 0,
        height: 0,
        text: '',
        externalLink: '',
        videoLink: '',
        time: videoPlayer.currentTime,
        startTime: Math.floor(videoPlayer.currentTime),
        endTime: Math.floor(videoPlayer.duration)
    };

    hotspotsByVideo[currentVideoPath].push(newHotspot);
    tempHotspotIndex = hotspotsByVideo[currentVideoPath].length - 1;

    resetHotspotForm();

    document.getElementById('hotspot-text').value = '';
    document.getElementById('hotspot-link').value = '';
    document.getElementById('hotspot-video-link').value = '';
    document.getElementById('cancel-hotspot').style.display = 'inline-block';
    document.getElementById('save-hotspot').textContent = 'Save Hotspot';

    document.addEventListener('mousemove', resizeHotspot);
    document.addEventListener('mouseup', finishCreatingHotspot);

    renderHotspots();
}

function resizeHotspot(event) {
    if (!isEditMode || tempHotspotIndex === null) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = hotspotOverlay.getBoundingClientRect();
    const scaleX = originalVideoWidth / rect.width;
    const scaleY = originalVideoHeight / rect.height;

    const hotspot = hotspotsByVideo[currentVideoPath][tempHotspotIndex];
    const currentX = (event.clientX - rect.left) * scaleX;
    const currentY = (event.clientY - rect.top) * scaleY;

    hotspot.width = Math.abs(currentX - hotspot.x);
    hotspot.height = Math.abs(currentY - hotspot.y);

    if (currentX < hotspot.x) {
        hotspot.width = hotspot.x - currentX;
        hotspot.x = currentX;
    }
    if (currentY < hotspot.y) {
        hotspot.height = hotspot.y - currentY;
        hotspot.y = currentY;
    }

    renderHotspots();
}

function centerHotspotForm() {
    setTimeout(() => {
        const form = document.getElementById('hotspot-form');
        const videoRect = videoPlayer.getBoundingClientRect();       
        form.style.display = 'block';       
        const formRect = form.getBoundingClientRect();
        form.style.left = `${videoRect.left + (videoRect.width - formRect.width) / 2}px`;
        form.style.top = `${videoRect.top + (videoRect.height - formRect.height) / 2}px`;
    }, 0);
}

function centerVideoOptionsDialogue() {
    setTimeout(() => {
        const dialogue = document.getElementById('video-options-dialogue');
        const videoRect = videoPlayer.getBoundingClientRect();
        
        dialogue.style.display = 'block';
        
        const dialogueRect = dialogue.getBoundingClientRect();
        
        dialogue.style.left = `${videoRect.left + (videoRect.width - dialogueRect.width) / 2}px`;
        dialogue.style.top = `${videoRect.top + (videoRect.height - dialogueRect.height) / 2}px`;
        
        const minLeft = videoRect.left;
        const maxLeft = videoRect.right - dialogueRect.width;
        const minTop = videoRect.top;
        const maxTop = videoRect.bottom - dialogueRect.height;
        
        dialogue.style.left = `${Math.max(minLeft, Math.min(maxLeft, parseInt(dialogue.style.left)))}px`;
        dialogue.style.top = `${Math.max(minTop, Math.min(maxTop, parseInt(dialogue.style.top)))}px`;
    }, 0);
}

function finishCreatingHotspot(event) {
    if (!isEditMode || tempHotspotIndex === null) return;
    event.preventDefault();
    event.stopPropagation();

    document.removeEventListener('mousemove', resizeHotspot);
    document.removeEventListener('mouseup', finishCreatingHotspot);

    const form = document.getElementById('hotspot-form');
    form.style.display = 'block';
    centerHotspotForm();

    document.getElementById('hotspot-text').value = '';
    document.getElementById('hotspot-link').value = '';
    document.getElementById('hotspot-video-link').value = '';

    document.getElementById('save-hotspot').onclick = saveHotspot;
    document.getElementById('cancel-hotspot').onclick = cancelHotspot;

    isCreatingHotspot = false;
    videoContainer.style.cursor = 'default';
    hotspotOverlay.style.pointerEvents = 'none';
    
    createHotspotBtn.textContent = 'Create Hotspot';

}

function saveHotspot() {
    if (currentVideoPath && hotspotsByVideo[currentVideoPath] && tempHotspotIndex !== null) {
        const hotspot = hotspotsByVideo[currentVideoPath][tempHotspotIndex];
        if (hotspot) {
            hotspot.text = document.getElementById('hotspot-text').value;
            hotspot.externalLink = document.getElementById('hotspot-link').value;
            hotspot.videoLink = document.getElementById('hotspot-video-link').value;
            hotspot.startTime = parseInt(document.getElementById('hotspot-start-time').value) || 0;
            hotspot.endTime = parseInt(document.getElementById('hotspot-end-time').value) || Math.floor(videoPlayer.duration);

            document.getElementById('hotspot-form').style.display = 'none';
            updateHotspotList();
            renderHotspots();

            tempHotspotIndex = null;
            deactivateHotspotCreation();
        } else {
            console.error('Hotspot not found at index:', tempHotspotIndex);
        }
    } else {
        console.error('Unable to save hotspot: Invalid state');
    }
}

function cancelHotspot() {
    hotspotsByVideo[currentVideoPath].pop();
    document.getElementById('hotspot-form').style.display = 'none';
    document.getElementById('delete-hotspot').style.display = 'none';
    tempHotspotIndex = null;
    updateHotspotList(); 
    deactivateHotspotCreation();
    renderHotspots();

}

function updateHotspotList() {
    const hotspotListElement = document.getElementById('hotspot-list');
    hotspotListElement.innerHTML = '';
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const li = document.createElement('li');
            li.textContent = `Hotspot ${index + 1}: ${hotspot.text} (${formatTime(hotspot.startTime)} - ${formatTime(hotspot.endTime)})`;
            if (hotspot.videoLink) {
                li.textContent += ` (Links to: ${path.basename(hotspot.videoLink)})`;
            }
            li.dataset.index = index;
            if (index === selectedHotspotIndex) {
                li.classList.add('selected');
            }
            if (selectedHotspotIndex !== null && selectedHotspotIndex >= hotspotsByVideo[currentVideoPath].length) {
                selectedHotspotIndex = null;
            }
            hotspotListElement.appendChild(li);
        });
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function editHotspot(index) {
        editingHotspotIndex = index;
        if (currentVideoPath && hotspotsByVideo[currentVideoPath] && hotspotsByVideo[currentVideoPath][index]) {
            const hotspot = hotspotsByVideo[currentVideoPath][index];
    const form = document.getElementById('hotspot-form');
    centerHotspotForm(); 
    hotspotForm.style.alignContent = 'center';
    
    document.getElementById('hotspot-text').value = hotspot.text || '';
    document.getElementById('hotspot-link').value = hotspot.externalLink || '';
    document.getElementById('hotspot-video-link').value = hotspot.videoLink || '';
    document.getElementById('hotspot-start-time').value = hotspot.startTime || 0;
    document.getElementById('hotspot-end-time').value = hotspot.endTime || Math.floor(videoPlayer.duration);
    
    document.getElementById('cancel-hotspot').style.display = 'none';
    deleteHotspotBtn.style.display = 'inline-block';
    document.getElementById('save-hotspot').textContent = 'Update Hotspot';
    document.getElementById('save-hotspot').onclick = saveEditedHotspot;
    document.getElementById('delete-hotspot').addEventListener('click', deleteSelectedHotspot);
    
    form.style.display = 'block';
  } else {
    console.error('Invalid hotspot index or current video path');
  }
    updateHotspotList();
    reinitializeTextInputs();
}

function saveEditedHotspot() {
    if (editingHotspotIndex !== null) {
        const hotspot = hotspotsByVideo[currentVideoPath][editingHotspotIndex];
        hotspot.text = document.getElementById('hotspot-text').value;
        hotspot.externalLink = document.getElementById('hotspot-link').value;
        hotspot.videoLink = document.getElementById('hotspot-video-link').value;
        hotspot.startTime = parseInt(document.getElementById('hotspot-start-time').value);
        hotspot.endTime = parseInt(document.getElementById('hotspot-end-time').value);

        updateHotspotList();
        renderHotspots();

        document.getElementById('hotspot-form').style.display = 'none';
        document.getElementById('delete-hotspot').style.display = 'none';
        console.log('Hotspot saved:', hotspot);
        console.log('Selected hotspot index after save:', selectedHotspotIndex);

        editingHotspotIndex = null;
    }
}

function selectHotspotInList(index) {
    selectedHotspotIndex = index;
    const hotspotListItems = document.querySelectorAll('#hotspot-list li');
    hotspotListItems.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    highlightSelectedHotspotInPlayer(index);
    editHotspot(index);
}

function highlightSelectedHotspotInPlayer(index) {
    const hotspotElements = hotspotOverlay.querySelectorAll('.hotspot');
    hotspotElements.forEach((element, i) => {
        if (i === index) {
            element.style.border = '2px solid red';
            element.style.zIndex = '10';
        } else {
            element.style.border = '2px dashed yellow';
            element.style.zIndex = '1';
        }
    });
}

function deleteSelectedHotspot() {
    if (editingHotspotIndex !== null && currentVideoPath) {
        hotspotsByVideo[currentVideoPath].splice(editingHotspotIndex, 1);
        document.getElementById('hotspot-form').style.display = 'none';
        document.getElementById('delete-hotspot').style.display = 'none';
        editingHotspotIndex = null;
        updateHotspotList();
        renderHotspots();
    }
}

function dragStart(e) {
    if (e.target === dragHandle) {
        isDragging = true;
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        e.preventDefault();
    }
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, hotspotForm);
    }
}

function dragEnd(e) {
    isDragging = false;
}

function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
}

function resetHotspotForm() {
    document.getElementById('hotspot-text').value = '';
    document.getElementById('hotspot-link').value = '';
    document.getElementById('hotspot-video-link').value = '';
    document.getElementById('hotspot-start-time').value = Math.floor(videoPlayer.currentTime);
    document.getElementById('hotspot-end-time').value = Math.floor(videoPlayer.duration);
}

function displayVideo(filePath) {
    videoContainer.style.display = 'flex';
    btnContainer.style.display = 'flex';
    if (currentVideoPath !== filePath) {
        document.getElementById('hotspot-form').style.display = 'none';
    }
    currentVideoPath = filePath;
    videoPlayer.src = filePath;
    videoPlayer.style.display = 'block';

    videoPlayer.onloadedmetadata = function() {
        originalVideoWidth = videoPlayer.videoWidth;
        originalVideoHeight = videoPlayer.videoHeight;
        renderHotspots();
        initializeVideoControls();
    };

    const index = videoList.indexOf(filePath);
    if (index !== -1) {
        selectVideo(index);
    }

    hotspotOverlay.innerHTML = '';
    hotspotOverlay.style.pointerEvents = isEditMode ? 'none' : 'auto';

    if (!hotspotsByVideo[currentVideoPath]) {
        hotspotsByVideo[currentVideoPath] = [];
    }

    videoOptionsBtn.style.display = isEditMode ? 'inline-block' : 'none';
    
    updateHotspotList();
    updateVideoLinkDropdown();
    renderHotspots();

    const options = videoOptions[filePath] || {};
    videoPlayer.loop = options.loop || false;

    videoControls.style.display = 'block';
    updateTimestamp();

    selectedHotspotIndex = null;
    updateHotspotList();

    videoPlayer.currentTime = 0;

    timelineSlider.style.display = 'block';
    timelineSlider.value = 0;

    videoPlayer.addEventListener('loadedmetadata', onVideoLoaded);
    videoPlayer.addEventListener('ended', handleVideoEnd);
    videoPlayer.addEventListener('timeupdate', updateTimelineSlider);
    videoPlayer.addEventListener('loadedmetadata', updateTimestamp);
    timelineSlider.addEventListener('input', seekVideo);
}

function showVideoOptions() {
    if (!currentVideoPath) {
        alert('Please select a video first.');
        return;
    }

    playNextSelect.innerHTML = '<option value="">None</option>';
    videoList.forEach((video, index) => {
        if (video !== currentVideoPath) {
            const option = document.createElement('option');
            option.value = video;
            option.textContent = `Video ${index + 1}: ${path.basename(video)}`;
            playNextSelect.appendChild(option);
        }
    });

    const currentOptions = videoOptions[currentVideoPath] || {};
    playNextSelect.value = currentOptions.playNext || '';
    loopCheckbox.checked = currentOptions.loop || false;

    centerVideoOptionsDialogue();
    videoOptionsDialogue.style.display = 'block';
}

function saveVideoOptions() {
    videoOptions[currentVideoPath] = {
        playNext: playNextSelect.value,
        loop: loopCheckbox.checked,
        autoplay: playNextSelect.value !== ''
    };
    closeVideoOptions();
}

function closeVideoOptions() {
    videoOptionsDialogue.style.display = 'none';
}

function handleVideoEnd() {
    console.log('Video ended');
    const options = videoOptions[currentVideoPath] || {};
    console.log('Video options:', options);
    if (options.loop) {
        console.log('Looping video');
        event.preventDefault();
        videoPlayer.currentTime = 0;
        ensureControlsVisible();
        updateTimelineSlider();
        updateTimestamp();
        if (videoPlayer.paused) {
            videoPlayer.play();
        }
        setTimeout(() => {
            updateTimelineSlider();
            updateTimestamp();
        }, 100);
    } else if (options.playNext) {
        console.log('Playing next video');
        shouldAutoPlay = true;
        transitionToNextVideo(options.playNext);
    } else {
        console.log('Video ended, no loop or next video');
        ensureControlsVisible();
    }
}

function ensureControlsVisible() {
    console.log('Ensuring controls are visible');
    if (currentVideoPath) {
        videoControls.style.display = 'block';
        timelineSlider.style.display = 'block';
        updateTimelineSlider();
        updateTimestamp();
    }
}

function transitionToNextVideo(nextVideoPath) {
    shouldAutoPlay = true;
    displayVideo(nextVideoPath);
    setTimeout(() => {
        console.log('Ensuring controls are visible');
        videoControls.style.display = 'block';
        timelineSlider.style.display = 'block';
        updateVideoPlayerControls();
    }, 100);
}

function onVideoLoaded() {
    console.log('Video loaded');
    updateTimelineSlider();
    updateTimestamp();
    if (shouldAutoPlay) {
        console.log('Auto-playing video');
        videoPlayer.play();
        shouldAutoPlay = false;
    }
    videoControls.style.display = 'block';
    timelineSlider.style.display = 'block';
}

function formatTime(timeInSeconds) {
    if (!timeInSeconds || isNaN(timeInSeconds)) {
        return "00:00";
    }
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateTimestamp() {
    const currentTime = formatTime(videoPlayer.currentTime);
    const duration = formatTime(videoPlayer.duration);
    timestampDisplay.textContent = `${currentTime} / ${duration}`;
}

function updateTimelineSlider() {
    const percentage = (videoPlayer.currentTime / videoPlayer.duration) * 100;
    timelineSlider.value = percentage;
    updateTimestamp();
}

function seekVideo() {
    const time = (timelineSlider.value / 100) * videoPlayer.duration;
    videoPlayer.currentTime = time;
    updateTimestamp();
}

function renderHotspots() {
    hotspotOverlay.innerHTML = '';
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        const videoRect = videoPlayer.getBoundingClientRect();
        const scaleX = videoRect.width / originalVideoWidth;
        const scaleY = videoRect.height / originalVideoHeight;

        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const hotspotElement = document.createElement('div');
            hotspotElement.className = 'hotspot';
            hotspotElement.style.left = `${hotspot.x * scaleX}px`;
            hotspotElement.style.top = `${hotspot.y * scaleY}px`;
            hotspotElement.style.width = `${hotspot.width * scaleX}px`;
            hotspotElement.style.height = `${hotspot.height * scaleY}px`;
            hotspotElement.dataset.index = index;

            if (!isEditMode) {
                hotspotElement.addEventListener('click', handleHotspotClick);
            }
            hotspotOverlay.appendChild(hotspotElement);
        });
    }
    updateHotspotVisibility();
}

function updateHotspotVisibility() {
    const currentTime = Math.floor(videoPlayer.currentTime);
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const hotspotElement = hotspotOverlay.querySelector(`[data-index="${index}"]`);
            if (hotspotElement) {
                const isVisible = currentTime >= hotspot.startTime && currentTime <= hotspot.endTime;
                hotspotElement.style.display = isVisible ? 'block' : 'none';
            }
        });
    }
}

function updateHotspotTimeRange() {
    const startTime = parseInt(document.getElementById('hotspot-start-time').value) || 0;
    const endTime = parseInt(document.getElementById('hotspot-end-time').value) || Math.floor(videoPlayer.duration);
    
    if (tempHotspotIndex !== null) {
        const hotspot = hotspotsByVideo[currentVideoPath][tempHotspotIndex];
        hotspot.startTime = startTime;
        hotspot.endTime = endTime;
        updateHotspotVisibility();
    }
}

function handleHotspotClick(event) {
    event.stopPropagation();
    const index = parseInt(event.target.dataset.index);
    const hotspot = hotspotsByVideo[currentVideoPath][index];
    
    if (hotspot.videoLink) {
        shouldAutoPlay = true;
        displayVideo(hotspot.videoLink);
    } else if (hotspot.externalLink) {
        window.open(hotspot.externalLink, '_blank');
    } else {
        alert(hotspot.text);
    }
}

function toggleMode() {
    isEditMode = !isEditMode;
    hotspotOverlay.style.pointerEvents = isEditMode ? 'none' : 'auto';
    toggleModeBtn.textContent = isEditMode ? 'Playback Mode' : 'Edit Mode';
    createHotspotBtn.style.display = isEditMode ? 'inline-block' : 'none';
    videoOptionsBtn.style.display = isEditMode ? 'inline-block' : 'none';

    if (!isEditMode) {
    document.getElementById('hotspot-form').style.display = 'none';
    }
    
    deactivateHotspotCreation();
    
    renderHotspots();

    selectedHotspotIndex = null;
    updateHotspotList();

    if (!isEditMode || (isEditMode && currentVideoPath)) {
        videoControls.style.display = 'block';
        timelineSlider.style.display = 'block';
    } else {
        //hideVideoControls();
    }

    if (currentVideoPath) {
        const index = videoList.indexOf(currentVideoPath);
        if (index !== -1) {
            selectVideo(index);
        }
    }
    
    if (currentVideoPath) {
        videoControls.style.display = 'block';
    } else {
        //hideVideoControls();
    }
}

function updateVideoPlayerControls() {
    videoPlayer.controls = false;
    videoControls.style.display = 'block';
    timelineSlider.style.display = 'block';
}

function hideVideoControls() {
    videoControls.style.display = 'none';
    timelineSlider.style.display = 'none';
}
function handleVideoResize() {
    const videoRect = videoPlayer.getBoundingClientRect();
    originalVideoWidth = videoPlayer.videoWidth;
    originalVideoHeight = videoPlayer.videoHeight;
    videoPlayer.style.width = '100%';
    videoPlayer.style.height = '100%';
    renderHotspots();
}

function updateControlsVisibility() {
    const isFullscreen = !!document.fullscreenElement;
    const videoControlsContainer = document.getElementById('video-controls');
    const controlsToManage = [
        { id: 'timeline-slider', defaultParent: videoControlsContainer },
        { id: 'timestamp-display', defaultParent: videoControlsContainer },
        { id: 'playback-controls', defaultParent: document.body }
    ];
    
    controlsToManage.forEach(control => {
        const element = document.getElementById(control.id);
        if (!element) return;

        if (isFullscreen) {
            element.classList.add('fullscreen-control');
            videoContainer.appendChild(element);
            
            element.style.position = 'fixed';
            if (control.id === 'timeline-slider') {
                element.style.bottom = '60px';
                element.style.left = '5%';
                element.style.width = '90%';
            } else if (control.id === 'timestamp-display') {
                element.style.bottom = '20px';
                element.style.left = '20px';
            } else if (control.id === 'playback-controls') {
                element.style.bottom = '20px';
                element.style.right = '20px';
            }
        } else {
            element.classList.remove('fullscreen-control');
            if (control.id === 'playback-controls') {
                control.defaultParent.appendChild(element);
                element.style.position = '';
                element.style.bottom = '';
                element.style.right = '';
                element.style.display = 'block';
                element.style.margin = '0 auto';
            } else {
                control.defaultParent.appendChild(element);
            }
            
            element.style.position = '';
            element.style.bottom = '';
            element.style.left = '';
            element.style.right = '';
            element.style.width = '';
        }

        if (control.id === 'video-options-btn') {
            element.style.display = isFullscreen ? 'none' : 'block';
        } else {
            element.style.display = 'block';
        }
    });
}

function handleResize() {
    if (videoPlayer.videoWidth > 0) {
        renderHotspots();
    }
}

function handleFullscreenChange() {
    const isFullscreen = document.fullscreenElement !== null;
    const videoContainer = document.getElementById('video-container');
    if (isFullscreen) {
        videoContainer.style.maxWidth = '100vw';
        videoContainer.style.width = '100vw';
        videoContainer.style.height = '100vh';
    } else {
        videoContainer.style.maxWidth = '800px';
        videoContainer.style.width = '100%';
        videoContainer.style.height = 'auto';
    }
    renderHotspots();
}

function newProject() {
    if (!confirm("Are you sure you want to start a new project? All unsaved changes will be lost.")) {
        return;
    }

    selectedHotspotIndex = null;
    updateHotspotList();

    videoList = [];
    hotspotsByVideo = {};
    currentVideoPath = null;
    isCreatingHotspot = false;
    tempHotspot = null;
    tempHotspotIndex = null;
    isEditMode = true;
    selectedVideoIndex = null;
    selectedHotspotIndex = null;
    videoOptions = {};
    shouldAutoPlay = false;
    originalVideoWidth = 0;
    originalVideoHeight = 0;

    document.getElementById('video-list').innerHTML = '';
    document.getElementById('hotspot-list').innerHTML = '';
    hotspotOverlay.innerHTML = '';
    videoPlayer.src = '';
    videoPlayer.style.display = 'none';
    document.getElementById('hotspot-form').style.display = 'none';

    videoControls.style.display = 'none';
    timelineSlider.style.display = 'none';
    timestampDisplay.textContent = '0:00 / 0:00';

    isEditMode = true;
    toggleModeBtn.textContent = 'Switch to Playback Mode';
    createHotspotBtn.style.display = 'inline-block';
    videoOptionsBtn.style.display = 'none';
    playPauseBtn.style.display = 'none';

    videoOptionsDialogue.style.display = 'none';

    updateControlsVisibility();
}

async function saveProject() {
    try {
        const projectData = {
            videoList,
            hotspotsByVideo,
            currentVideoPath,
            videoOptions
        };

        const { filePath } = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: 'project.fmvp',
            filters: [{ name: 'FMV Project', extensions: ['fmvp'] }]
        });

        if (!filePath) return;

        const zip = new JSZip();

        zip.file('project.json', JSON.stringify(projectData));

        for (const videoPath of videoList) {
            const videoContent = await fs.readFile(videoPath);
            zip.file(`videos/${path.basename(videoPath)}`, videoContent);
        }

        const content = await zip.generateAsync({ type: 'nodebuffer' });
        console.log('Zip file size:', content.length);

        await fs.writeFile(filePath, content);

        alert('Project saved successfully!');
    } catch (error) {
        console.error('Error saving project:', error);
        alert('Failed to save project. See console for details.');
    }
}

async function loadProject() {
    try {
        const { filePaths } = await ipcRenderer.invoke('show-open-dialog', {
            filters: [{ name: 'FMV Project', extensions: ['fmvp'] }],
            properties: ['openFile']
        });

        if (filePaths.length === 0) {
            console.log('User cancelled the open dialog');
            return;
        }

        const projectFilePath = filePaths[0];
        console.log('Selected project file:', projectFilePath);

        const content = await fs.readFile(projectFilePath);
        console.log('Project file read, size:', content.length);

        const zip = new JSZip();
        await zip.loadAsync(content);
        console.log('ZIP file loaded successfully');

        const projectDataJson = await zip.file('project.json').async('string');
        if (!projectDataJson) {
            throw new Error('project.json not found in the project file');
        }

        let projectData;
        try {
            projectData = JSON.parse(projectDataJson);
            console.log('Project data parsed:', projectData);
        } catch (parseError) {
            console.error('Error parsing project data:', parseError);
            throw new Error('Invalid project data format');
        }

        if (!projectData.videoList || !Array.isArray(projectData.videoList)) {
            throw new Error('Invalid or missing videoList in project data');
        }

        const videoFolder = zip.folder('videos');
        if (!videoFolder) {
            throw new Error('Videos folder not found in the project file');
        }

        videoList = [];
        hotspotsByVideo = {};
        videoOptions = {};

        const tempDir = await ipcRenderer.invoke('get-temp-dir');
        console.log('Temporary directory created:', tempDir);

        const pathMapping = {};

        for (const filePath of projectData.videoList) {
            const fileName = path.basename(filePath);
            const file = videoFolder.file(fileName);
            if (file) {
                const videoContent = await file.async('nodebuffer');
                const tempFilePath = path.join(tempDir, fileName);
                await fs.writeFile(tempFilePath, videoContent);
                videoList.push(tempFilePath);
                pathMapping[filePath] = tempFilePath;
                console.log('Video extracted:', tempFilePath);
            } else {
                console.warn(`Video file not found in project: ${fileName}`);
            }
        }

        hotspotsByVideo = {};
        for (const [originalPath, hotspots] of Object.entries(projectData.hotspotsByVideo)) {
            const newPath = pathMapping[originalPath];
            if (newPath) {
                hotspotsByVideo[newPath] = hotspots.map(hotspot => ({
                    ...hotspot,
                    videoLink: hotspot.videoLink ? pathMapping[hotspot.videoLink] || hotspot.videoLink : ''
                }));
            }
        }

        currentVideoPath = pathMapping[projectData.currentVideoPath] || null;

        videoOptions = {};
        for (const [originalPath, options] of Object.entries(projectData.videoOptions)) {
            const newPath = pathMapping[originalPath];
            if (newPath) {
                videoOptions[newPath] = {
                    ...options,
                    playNext: options.playNext ? pathMapping[options.playNext] || options.playNext : null
                };
            }
        }

        console.log('Project data restored');
        console.log('Video list:', videoList);
        console.log('Current video path:', currentVideoPath);
        console.log('Hotspots by video:', hotspotsByVideo);

        updateVideoListUI();
        if (currentVideoPath && videoList.includes(currentVideoPath)) {
            displayVideo(currentVideoPath);
        } else {
            hideVideoControls();
            console.log('No valid current video to display');
        }

        renderHotspots();
        updateHotspotList();

        setTimeout(() => {
            const hotspotForm = document.getElementById('hotspot-form');
            const textInputs = hotspotForm.querySelectorAll('input[type="text"], input[type="number"]');
            
            textInputs.forEach(input => {
                const parent = input.parentNode;
                const nextSibling = input.nextSibling;
                const newInput = input.cloneNode(true);
                
                newInput.disabled = false;
                newInput.readOnly = false;
                
                newInput.addEventListener('input', function(e) {
                    console.log(`Input event on ${this.id}: ${this.value}`);
                });

                parent.replaceChild(newInput, input);
                
                console.log(`Refreshed input: ${newInput.id}`);
            });

            if (textInputs.length > 0) {
                textInputs[0].focus();
                console.log("Focused on first text input");
            }
        }, 100);

        console.log("Project loaded successfully");
        alert('Project loaded successfully!');
    } catch (error) {
        console.error('Error loading project:', error);
        alert(`Failed to load project: ${error.message}`);
    }
}

function reinitializeTextInputs() {
    const hotspotForm = document.getElementById('hotspot-form');
    const textInputs = hotspotForm.querySelectorAll('input[type="text"], input[type="number"]');
    
    textInputs.forEach(input => {
        input.disabled = false;
        input.readOnly = false;
        
        const newInput = input.cloneNode(true);
        
        newInput.addEventListener('input', function(e) {
            console.log(`Input event on ${this.id}: ${this.value}`);
        });

        input.parentNode.replaceChild(newInput, input);
        
        console.log(`Reinitialized input: ${newInput.id}`);
    });
}

async function exportProject() {
    try {
        const { filePath } = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: 'interactive_film_export.zip',
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
        });

        if (!filePath) return;

        const zip = new JSZip();

        const htmlContent = generateHTMLContent();
        zip.file('index.html', htmlContent);

        const jsContent = generateJavaScriptContent();
        zip.file('script.js', jsContent);

        const cssContent = generateCSSContent();
        zip.file('styles.css', cssContent);

        for (const videoPath of videoList) {
            const videoContent = await fs.readFile(videoPath);
            const filename = videoPath.split(/[/\\]/).pop();
            zip.file(`videos/${filename}`, videoContent);
        }

        const content = await zip.generateAsync({ type: 'nodebuffer' });

        await fs.writeFile(filePath, content);

        alert('Project exported successfully!');
    } catch (error) {
        console.error('Error exporting project:', error);
        alert('Failed to export project. See console for details.');
    }
}

function generateHTMLContent() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FMVMachine</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="video-container">
        <video id="video-player"></video>
        <div id="hotspot-overlay"></div>
    </div>
    <div id="controls">
        <button id="play-pause">Play/Pause</button>
        <input type="range" id="timeline-slider" min="0" max="100" value="0">
        <span id="timestamp-display">0:00 / 0:00</span>
    </div>
    <script src="script.js"></script>
</body>
</html>
    `;
}

function generateJavaScriptContent() {
    const videoFilenames = videoList.map(path => path.split(/[/\\]/).pop());

    const exportHotspotsByVideo = {};
    for (const [key, value] of Object.entries(hotspotsByVideo)) {
        const newKey = 'videos/' + key.split(/[/\\]/).pop();
        exportHotspotsByVideo[newKey] = value.map(hotspot => ({
            ...hotspot,
            videoLink: hotspot.videoLink ? 'videos/' + hotspot.videoLink.split(/[/\\]/).pop() : ''
        }));
    }

    const exportVideoOptions = {};
    for (const [key, value] of Object.entries(videoOptions)) {
        const newKey = 'videos/' + key.split(/[/\\]/).pop();
        const newValue = {...value};
        if (newValue.playNext) {
            newValue.playNext = 'videos/' + newValue.playNext.split(/[/\\]/).pop();
        }
        exportVideoOptions[newKey] = newValue;
    }

    return `
const videoPlayer = document.getElementById('video-player');
const hotspotOverlay = document.getElementById('hotspot-overlay');
const playPauseBtn = document.getElementById('play-pause');
const timelineSlider = document.getElementById('timeline-slider');
const timestampDisplay = document.getElementById('timestamp-display');

const videoList = ${JSON.stringify(videoFilenames.map(filename => 'videos/' + filename))};
const hotspotsByVideo = ${JSON.stringify(exportHotspotsByVideo)};
const videoOptions = ${JSON.stringify(exportVideoOptions)};

let currentVideoPath = null;
let originalVideoWidth = 0;
let originalVideoHeight = 0;

function initializePlayer() {
    currentVideoPath = videoList[0];
    loadVideo(currentVideoPath);
    updateControls();
    window.addEventListener('resize', handleResize);
}

function loadVideo(filePath) {
    currentVideoPath = filePath;
    videoPlayer.src = filePath;
    videoPlayer.style.display = 'block';

    videoPlayer.onloadedmetadata = function() {
        originalVideoWidth = videoPlayer.videoWidth;
        originalVideoHeight = videoPlayer.videoHeight;
        renderHotspots();
    };

    const options = videoOptions[filePath] || {};
    videoPlayer.loop = options.loop || false;

    updateTimestamp();
    videoPlayer.currentTime = 0;
    timelineSlider.value = 0;

    videoPlayer.play();
}

function renderHotspots() {
    hotspotOverlay.innerHTML = '';
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        const videoRect = videoPlayer.getBoundingClientRect();
        const scaleX = videoRect.width / originalVideoWidth;
        const scaleY = videoRect.height / originalVideoHeight;

        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const hotspotElement = document.createElement('div');
            hotspotElement.className = 'hotspot';
            hotspotElement.style.left = \`\${hotspot.x * scaleX}px\`;
            hotspotElement.style.top = \`\${hotspot.y * scaleY}px\`;
            hotspotElement.style.width = \`\${hotspot.width * scaleX}px\`;
            hotspotElement.style.height = \`\${hotspot.height * scaleY}px\`;
            hotspotElement.dataset.index = index;
            hotspotElement.addEventListener('click', handleHotspotClick);
            
            hotspotOverlay.appendChild(hotspotElement);
        });
    }
    updateHotspotVisibility();
}

function handleHotspotClick(event) {
    event.stopPropagation();
    const index = parseInt(event.target.dataset.index);
    const hotspot = hotspotsByVideo[currentVideoPath][index];
    
    if (hotspot.videoLink) {
        loadVideo(hotspot.videoLink);
    } else if (hotspot.externalLink) {
        window.open(hotspot.externalLink, '_blank');
    } else {
        alert(hotspot.text);
    }
}

function updateControls() {
    playPauseBtn.addEventListener('click', togglePlayPause);
    videoPlayer.addEventListener('timeupdate', updateTimelineSlider);
    videoPlayer.addEventListener('loadedmetadata', updateTimestamp);
    timelineSlider.addEventListener('input', seekVideo);
    videoPlayer.addEventListener('ended', handleVideoEnd);
}

function togglePlayPause() {
    if (videoPlayer.paused) {
        videoPlayer.play();
    } else {
        videoPlayer.pause();
    }
}

function updateTimelineSlider() {
    const percentage = (videoPlayer.currentTime / videoPlayer.duration) * 100;
    timelineSlider.value = percentage;
    updateTimestamp();
    updateHotspotVisibility();
}

function seekVideo() {
    const time = (timelineSlider.value / 100) * videoPlayer.duration;
    videoPlayer.currentTime = time;
    updateTimestamp();
    updateHotspotVisibility();
}

function updateTimestamp() {
    const currentTime = formatTime(videoPlayer.currentTime);
    const duration = formatTime(videoPlayer.duration);
    timestampDisplay.textContent = \`\${currentTime} / \${duration}\`;
}

function handleVideoEnd() {
    const options = videoOptions[currentVideoPath] || {};
    if (options.loop) {
        videoPlayer.currentTime = 0;
        videoPlayer.play();
    } else if (options.playNext) {
        loadVideo(options.playNext);
    }
}

function formatTime(timeInSeconds) {
    if (!timeInSeconds || isNaN(timeInSeconds)) {
        return "00:00";
    }
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return \`\${minutes}:\${seconds.toString().padStart(2, '0')}\`;
}

function handleResize() {
    if (videoPlayer.videoWidth > 0) {
        renderHotspots();
    }
}

function updateHotspotVisibility() {
    const currentTime = videoPlayer.currentTime;
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const hotspotElement = hotspotOverlay.querySelector(\`[data-index="\${index}"]\`);
            if (hotspotElement) {
                const isVisible = currentTime >= hotspot.startTime && currentTime <= hotspot.endTime;
                hotspotElement.style.display = isVisible ? 'block' : 'none';
            }
        });
    }
}

videoPlayer.addEventListener('timeupdate', updateHotspotVisibility);

initializePlayer();
    `;
}

function generateCSSContent() {
    return `
body {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: #000;
    color: #fff;
    font-family: Arial, sans-serif;
}

#video-container {
    position: relative;
    width: 100%;
    max-width: 800px;
}

#video-player {
    width: 100%;
    height: auto;
}

#hotspot-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.hotspot {
    position: absolute;
    cursor: pointer;
    pointer-events: auto;
}

#controls {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}

#play-pause {
    padding: 5px 10px;
    background-color: #333;
    color: #fff;
    border: none;
    cursor: pointer;
}

#timeline-slider {
    width: 300px;
}

#timestamp-display {
    font-size: 14px;
}
    `;
}

videoPlayer.addEventListener('click', (event) => {
    if (isEditMode) {
        event.preventDefault();
        event.stopPropagation();
    }
});

window.addEventListener('resize', handleResize);
videoPlayer.addEventListener('timeupdate', updateHotspotVisibility);
videoPlayer.addEventListener('ended', hideVideoControls);

updateVideoPlayerControls();
renderHotspots();
hideVideoControls();