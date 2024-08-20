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
let tempHotspot = null;
let tempHotspotIndex = null;
let isEditMode = true;
let selectedVideoIndex = null;
let selectedHotspotIndex = null;
let videoOptions = {};
let shouldAutoPlay = false;
let originalVideoWidth = 0;
let originalVideoHeight = 0;

const importVideoBtn = document.getElementById('import-video');
const createHotspotBtn = document.getElementById('create-hotspot');
const toggleModeBtn = document.getElementById('toggle-mode');
const fullscreenToggleBtn = document.getElementById('fullscreen-toggle');
const saveProjectBtn = document.getElementById('save-project');
const loadProjectBtn = document.getElementById('load-project');
const videoPlayer = document.getElementById('video-player');
const videoContainer = document.getElementById('video-container');
const hotspotOverlay = document.getElementById('hotspot-overlay');
const videoControls = document.getElementById('video-controls');
const playbackControls = document.getElementById('playback-controls');
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

// Add the export button to the top menu
const exportBtn = document.createElement('button');
exportBtn.textContent = 'Export Project';
exportBtn.id = 'export-project';
document.getElementById('top-menu').appendChild(exportBtn);

deleteHotspotBtn.addEventListener('click', deleteSelectedHotspot);
videoOptionsBtn.addEventListener('click', showVideoOptions);
saveVideoOptionsBtn.addEventListener('click', saveVideoOptions);
closeVideoOptionsBtn.addEventListener('click', closeVideoOptions);
videoPlayer.addEventListener('ended', handleVideoEnd);
document.addEventListener('fullscreenchange', updateControlsVisibility);
newProjectBtn.addEventListener('click', newProject);

importVideoBtn.addEventListener('click', () => {
    ipcRenderer.send('import-video');
});

createHotspotBtn.addEventListener('click', () => {
    if (currentVideoPath && isEditMode) {
        if (!isCreatingHotspot) {
            activateHotspotCreation();
        } else {
            deactivateHotspotCreation();
        }
    } else if (!isEditMode) {
        alert('Please switch to Edit Mode to create hotspots.');
    } else {
        alert('Please select a video first.');
    }
});

toggleModeBtn.addEventListener('click', toggleMode);
fullscreenToggleBtn.addEventListener('click', toggleFullscreen);
saveProjectBtn.addEventListener('click', saveProject);
loadProjectBtn.addEventListener('click', loadProject);
exportBtn.addEventListener('click', exportProject);

ipcRenderer.on('video-imported', (event, filePath) => {
    console.log('Video imported:', filePath);
    addVideoToList(filePath);
    displayVideo(filePath);
    updateVideoLinkDropdown();
});

function initializeApp() {
    setInterval(ensureControlsVisible, 1000);
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

function activateHotspotCreation() {
    isCreatingHotspot = true;
    videoContainer.style.cursor = 'crosshair';
    hotspotOverlay.style.pointerEvents = 'auto';
    hotspotOverlay.addEventListener('mousedown', startCreatingHotspot);
    createHotspotBtn.textContent = 'Cancel Hotspot Creation';
    resetHotspotForm();
}

function deactivateHotspotCreation() {
    isCreatingHotspot = false;
    videoContainer.style.cursor = 'default';
    hotspotOverlay.style.pointerEvents = 'none';
    hotspotOverlay.removeEventListener('mousedown', startCreatingHotspot);
    createHotspotBtn.textContent = 'Create Hotspot';
    deleteHotspotBtn.style.display = 'none';
    if (tempHotspotIndex !== null) {
        hotspotsByVideo[currentVideoPath].pop();
        tempHotspotIndex = null;
    }
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
        time: videoPlayer.currentTime
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

function finishCreatingHotspot(event) {
    if (!isEditMode || tempHotspotIndex === null) return;
    event.preventDefault();
    event.stopPropagation();

    document.removeEventListener('mousemove', resizeHotspot);
    document.removeEventListener('mouseup', finishCreatingHotspot);

    const form = document.getElementById('hotspot-form');
    form.style.display = 'block';
    const hotspot = hotspotsByVideo[currentVideoPath][tempHotspotIndex];
    
    const videoRect = videoPlayer.getBoundingClientRect();
    const scaleX = videoRect.width / originalVideoWidth;
    const scaleY = videoRect.height / originalVideoHeight;
    form.style.left = `${hotspot.x * scaleX + hotspot.width * scaleX}px`;
    form.style.top = `${hotspot.y * scaleY}px`;

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
    const hotspot = hotspotsByVideo[currentVideoPath][tempHotspotIndex];
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
}

function cancelHotspot() {
    hotspotsByVideo[currentVideoPath].pop();
    document.getElementById('hotspot-form').style.display = 'none';
    tempHotspotIndex = null;
    deactivateHotspotCreation();
    renderHotspots();

}

function updateHotspotList() {
    const list = document.getElementById('hotspot-list');
    list.innerHTML = '';
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const li = document.createElement('li');
            li.textContent = `Hotspot ${index + 1}: ${hotspot.text} (${formatTime(hotspot.startTime)} - ${formatTime(hotspot.endTime)})`;
            if (hotspot.videoLink) {
                li.textContent += ` (Links to: ${path.basename(hotspot.videoLink)})`;
            }
            li.onclick = () => {
                if (isEditMode) {
                    editHotspot(index);
                }
            };
            if (index === editingHotspotIndex) {
                li.classList.add('selected');
            }
            list.appendChild(li);
        });
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

let editingHotspotIndex = null;
let isCreatingNewHotspot = false;

function editHotspot(index) {
    editingHotspotIndex = index;
    isCreatingNewHotspot = false;
    const hotspot = hotspotsByVideo[currentVideoPath][index];
    const form = document.getElementById('hotspot-form');
    
    document.getElementById('hotspot-text').value = hotspot.text || '';
    document.getElementById('hotspot-link').value = hotspot.externalLink || '';
    document.getElementById('hotspot-video-link').value = hotspot.videoLink || '';
    document.getElementById('hotspot-start-time').value = hotspot.startTime || 0;
    document.getElementById('hotspot-end-time').value = hotspot.endTime || Math.floor(videoPlayer.duration);
    
    const videoRect = videoPlayer.getBoundingClientRect();
    const scaleX = videoRect.width / originalVideoWidth;
    const scaleY = videoRect.height / originalVideoHeight;
    form.style.left = `${hotspot.x * scaleX + hotspot.width * scaleX}px`;
    form.style.top = `${hotspot.y * scaleY}px`;
    
    // Hide the Cancel button when editing an existing hotspot
    document.getElementById('cancel-hotspot').style.display = 'none';
    document.getElementById('save-hotspot').textContent = 'Update Hotspot';
    
    form.style.display = 'block';
    
    highlightSelectedHotspot(index);
}

function saveEditedHotspot() {
    if (editingHotspotIndex === null) return;
    
    const hotspot = hotspotsByVideo[currentVideoPath][editingHotspotIndex];
    hotspot.text = document.getElementById('hotspot-text').value;
    hotspot.externalLink = document.getElementById('hotspot-link').value;
    hotspot.videoLink = document.getElementById('hotspot-video-link').value;
    hotspot.startTime = parseInt(document.getElementById('hotspot-start-time').value) || 0;
    hotspot.endTime = parseInt(document.getElementById('hotspot-end-time').value) || Math.floor(videoPlayer.duration);
    
    document.getElementById('hotspot-form').style.display = 'none';
    
    updateHotspotList();
    renderHotspots();
    updateHotspotVisibility();

    console.log('Hotspot saved:', hotspot); // For debugging

    editingHotspotIndex = null;
}

function cancelEditHotspot() {
    document.getElementById('hotspot-form').style.display = 'none';
    const hotspotElements = hotspotOverlay.getElementsByClassName('hotspot');
    Array.from(hotspotElements).forEach(el => el.style.border = '2px dashed yellow');

}

function resetHotspotForm() {
    document.getElementById('hotspot-text').value = '';
    document.getElementById('hotspot-link').value = '';
    document.getElementById('hotspot-video-link').value = '';
    document.getElementById('hotspot-start-time').value = Math.floor(videoPlayer.currentTime);
    document.getElementById('hotspot-end-time').value = Math.floor(videoPlayer.duration);
}

function selectHotspot(index) {
    selectedHotspotIndex = index;
    updateHotspotList();
    renderHotspots();
    deleteHotspotBtn.style.display = 'inline-block';
    
}

function deleteSelectedHotspot() {
    if (selectedHotspotIndex !== null && currentVideoPath) {
        hotspotsByVideo[currentVideoPath].splice(selectedHotspotIndex, 1);
        selectedHotspotIndex = null;
        updateHotspotList();
        renderHotspots();
        cancelEditHotspot();
        deleteHotspotBtn.style.display = 'none';
    }
}

function displayVideo(filePath) {
    if (currentVideoPath !== filePath) {
        // Close the hotspot edit menu if it's open
        document.getElementById('hotspot-form').style.display = 'none';
    }
    currentVideoPath = filePath;
    videoPlayer.src = filePath;
    videoPlayer.style.display = 'block';

    videoPlayer.onloadedmetadata = function() {
        originalVideoWidth = videoPlayer.videoWidth;
        originalVideoHeight = videoPlayer.videoHeight;
        renderHotspots();
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
    createPlayPauseButton();
    updateTimestamp();

    selectedHotspotIndex = null;
    updateHotspotList();
    deleteHotspotBtn.style.display = 'none';

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
    const options = videoOptions[currentVideoPath] || {};
    if (options.loop) {
        videoPlayer.currentTime = 0;
        videoPlayer.play();
    } else if (options.playNext) {
        shouldAutoPlay = true;
        transitionToNextVideo(options.playNext);
    }
}

function transitionToNextVideo(nextVideoPath) {
    shouldAutoPlay = true;
    displayVideo(nextVideoPath);
    setTimeout(() => {
        console.log('Ensuring controls are visible');
        videoControls.style.display = 'block';
        timelineSlider.style.display = 'block';
        playbackControls.style.display = 'block';
        updateVideoPlayerControls();
        createPlayPauseButton();
    }, 100);
}

function ensureControlsVisible() {
    if (!isEditMode && currentVideoPath) {
        videoControls.style.display = 'block';
        timelineSlider.style.display = 'block';
        playbackControls.style.display = 'block';
    }
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
    playbackControls.style.display = 'block';
}

function createPlayPauseButton() {
    playbackControls.innerHTML = '';
    const playPauseBtn = document.createElement('button');
    playPauseBtn.textContent = 'Play/Pause';
    playPauseBtn.addEventListener('click', togglePlayPause);
    playbackControls.appendChild(playPauseBtn);
}

function togglePlayPause() {
    if (videoPlayer.paused) {
        videoPlayer.play();
    } else {
        videoPlayer.pause();
    }
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
            
            if (isEditMode) {
                hotspotElement.style.border = index === editingHotspotIndex ? '2px solid red' : '2px dashed yellow';
                hotspotElement.style.cursor = 'pointer';
                hotspotElement.onclick = () => editHotspot(index);
            } else {
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

function highlightSelectedHotspot(index) {
    const hotspotElements = hotspotOverlay.getElementsByClassName('hotspot');
    Array.from(hotspotElements).forEach((el, i) => {
        el.style.border = i === index ? '2px solid red' : '2px dashed yellow';
    });
}

document.getElementById('save-hotspot').addEventListener('click', saveEditedHotspot);
document.getElementById('cancel-hotspot').addEventListener('click', () => {
    document.getElementById('hotspot-form').style.display = 'none';
    editingHotspotIndex = null;
    renderHotspots();
});

videoPlayer.addEventListener('timeupdate', () => {
    updateTimelineSlider();
    updateHotspotVisibility();
        
    });

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

document.getElementById('hotspot-start-time').addEventListener('input', updateHotspotTimeRange);
document.getElementById('hotspot-end-time').addEventListener('input', updateHotspotTimeRange);

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
    toggleModeBtn.textContent = isEditMode ? 'Switch to Playback Mode' : 'Switch to Edit Mode';
    createHotspotBtn.style.display = isEditMode ? 'inline-block' : 'none';
    videoOptionsBtn.style.display = isEditMode ? 'inline-block' : 'none';

    // Close the hotspot edit menu when switching to playback mode
    if (!isEditMode) {
    document.getElementById('hotspot-form').style.display = 'none';
    }
    
    deactivateHotspotCreation();
    
    renderHotspots();

    selectedHotspotIndex = null;
    updateHotspotList();

    if (!isEditMode) {
        deleteHotspotBtn.style.display = 'none';
    }

    if (!isEditMode || (isEditMode && currentVideoPath)) {
        videoControls.style.display = 'block';
        timelineSlider.style.display = 'block';
        createPlayPauseButton();
    } else {
        hideVideoControls();
    }

    if (currentVideoPath) {
        const index = videoList.indexOf(currentVideoPath);
        if (index !== -1) {
            selectVideo(index);
        }
    }
    
    if (currentVideoPath) {
        videoControls.style.display = 'block';
        createPlayPauseButton();
    } else {
        hideVideoControls();
    }
}

function updateVideoPlayerControls() {
    videoPlayer.controls = false;
    videoControls.style.display = 'block';
    timelineSlider.style.display = 'block';
    playbackControls.style.display = 'block';
}

function hideVideoControls() {
    videoControls.style.display = 'none';
    timelineSlider.style.display = 'none';
    playbackControls.innerHTML = '';
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
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

window.addEventListener('resize', handleResize);
videoPlayer.addEventListener('loadedmetadata', handleResize);

function updateHotspotVisibility() {
    const currentTime = Math.floor(videoPlayer.currentTime);
    if (currentVideoPath && hotspotsByVideo[currentVideoPath]) {
        hotspotsByVideo[currentVideoPath].forEach((hotspot, index) => {
            const hotspotElement = hotspotOverlay.querySelector(`[data-index="${index}"]`);
            if (hotspotElement) {
                const isVisible = currentTime >= (hotspot.startTime || 0) && currentTime <= (hotspot.endTime || Math.floor(videoPlayer.duration));
                hotspotElement.style.display = isVisible ? 'block' : 'none';
            }
        });
    }
}

function newProject() {
    // Ask for confirmation
    if (!confirm("Are you sure you want to start a new project? All unsaved changes will be lost.")) {
        return;
    }

    // Reset all state variables
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

    // Clear the UI
    document.getElementById('video-list').innerHTML = '';
    document.getElementById('hotspot-list').innerHTML = '';
    hotspotOverlay.innerHTML = '';
    videoPlayer.src = '';
    videoPlayer.style.display = 'none';
    document.getElementById('hotspot-form').style.display = 'none';

    // Reset controls
    videoControls.style.display = 'none';
    timelineSlider.style.display = 'none';
    timestampDisplay.textContent = '0:00 / 0:00';
    playbackControls.innerHTML = '';

    // Reset mode
    isEditMode = true;
    toggleModeBtn.textContent = 'Switch to Playback Mode';
    createHotspotBtn.style.display = 'inline-block';
    videoOptionsBtn.style.display = 'none';
    deleteHotspotBtn.style.display = 'none';

    // Clear any open dialogs
    videoOptionsDialogue.style.display = 'none';

    // Re-initialize any necessary components
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
        console.log('Starting project load process');

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

        for (const [path, options] of Object.entries(videoOptions)) {
            if (options.playNext) {
                options.playNext = pathMapping[options.playNext] || options.playNext;
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

        console.log('Project loaded successfully');
        alert('Project loaded successfully!');
    } catch (error) {
        console.error('Error loading project:', error);
        console.error('Error stack:', error.stack);
        alert(`Failed to load project: ${error.message}`);
        
        videoList = [];
        hotspotsByVideo = {};
        videoOptions = {};
        currentVideoPath = null;
        hideVideoControls();
        updateVideoListUI();
    }
}

async function exportProject() {
    try {
        const { filePath } = await ipcRenderer.invoke('show-save-dialog', {
            defaultPath: 'interactive_film_export.zip',
            filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
        });

        if (!filePath) return; // User cancelled the save dialog

        const zip = new JSZip();

        // Add HTML file
        const htmlContent = generateHTMLContent();
        zip.file('index.html', htmlContent);

        // Add JavaScript file
        const jsContent = generateJavaScriptContent();
        zip.file('script.js', jsContent);

        // Add CSS file
        const cssContent = generateCSSContent();
        zip.file('styles.css', cssContent);

        // Add video files
        for (const videoPath of videoList) {
            const videoContent = await fs.readFile(videoPath);
            const filename = videoPath.split(/[/\\]/).pop(); // Extract filename
            zip.file(`videos/${filename}`, videoContent);
        }

        // Generate zip file
        const content = await zip.generateAsync({ type: 'nodebuffer' });

        // Save the file
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
    // Extract filenames from paths
    const videoFilenames = videoList.map(path => path.split(/[/\\]/).pop());

    // Create a new hotspotsByVideo object with updated video paths
    const exportHotspotsByVideo = {};
    for (const [key, value] of Object.entries(hotspotsByVideo)) {
        const newKey = 'videos/' + key.split(/[/\\]/).pop();
        exportHotspotsByVideo[newKey] = value.map(hotspot => ({
            ...hotspot,
            videoLink: hotspot.videoLink ? 'videos/' + hotspot.videoLink.split(/[/\\]/).pop() : ''
        }));
    }

    // Create a new videoOptions object with updated video paths
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

toggleMode();
toggleMode();