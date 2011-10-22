// Copyright (C) 2011 by Niklas Bergius
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

(function ($) {
	var _,
		players = {},
		gui = {},
		currentTime = 0,
		initialized = { count: 0 },
		allowedDiff = 50, syncTargetPlayer,
		nudgeMilliseconds = 167,
		timeouts = { currentTime: null, attemptSync: null },
		intervals = { currentTime: 100, attemptSync: 167 },
		states = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 },
		toState = (function () { var x = {}; $.each(states, function (key, value) { x[value] = key; }); return x; }()),
		isPlaying = false, isSyncing = false,
		maxDuration;

	window.onYouTubePlayerReady = function (id) {
		console.log('init', id);

		var elem = $('#' + id),
			idx = elem.index(),
			video = gui.ids[idx].val(),
			player = elem.get(0),
			duration;
			
		cueVideo(player, video);
		
		player.addEventListener('onStateChange', 'function (state) { onPlayerStateChange(' + idx + ', state); }');
	};
	
	window.onPlayerStateChange = function (idx, state) {
		console.log('state changed: player %s, state %s', idx, toState[state]);
		
		var duration, player = players[idx];
		
		if (state === states.playing && !isPlaying) {
			console.log('playing without permission, wtf');
			pause();
		}
		
		if (state === states.paused && !initialized[idx]) {
			duration = player.getDuration();
			if (!maxDuration) maxDuration = duration;
			else { maxDuration = Math.max(maxDuration, duration); }
			initialized[idx] = true;
			
			initialized.count = initialized.count + 1;
			if (initialized.count === 3) {
				console.log('initialized');
				gui.current.text(currentTime);
				gui.total.text(maxDuration);
				$('#buttons').show();
				if (gui.autoMute.prop('checked')) {
					mute(1); mute(2);
				}
			}
			
			setPageClass('paused');
		}
	};
	
	function resetInitialized() {
		initialized = { count: 0 };
	}
	
	function cueVideo(player, video) {
		player.cueVideoById(video);
		player.playVideo();
		player.pauseVideo();
		player.seekTo(0);
	}
	
	function setPageClass(className) {
		if (className !== 'loading' && initialized.count < 3) { return; }
		document.body.className = className;
	}
		
	function mute(idx, manual) {
		if (!manual && !gui.autoMute.prop('checked')) { return; }
		
	    players[idx].mute();
        gui.mutes[idx].addClass('muted');
	}

	function unMute(idx, manual) {
		if (!manual && !gui.autoMute.prop('checked')) { return; }

	    players[idx].unMute();
        gui.mutes[idx].removeClass('muted');
	}
	
	function pollCurrentTime(requeue) {
		var lowestTime;
		$.each(players, function (_, player) {
			var myTime = player.getCurrentTime();
			if (!lowestTime) lowestTime = myTime;
			else { lowestTime = Math.min(lowestTime, myTime); }
		});
		currentTime = lowestTime;
		updateCurrentTimeGui();
		
		if (requeue) { queueCurrentTime(); }
	}
	
	function updateCurrentTimeGui() {
		gui.current.text(currentTime);
	}
	
	function queueCurrentTime() {
		stopCurrentTime();
		timeouts.currentTime = setTimeout(pollCurrentTime, intervals.currentTime, true);
	}
	
	function stopCurrentTime() {
		clearTimeout(timeouts.currentTime);
	}
	
	function beginAttemptSync() {
		if (!isPlaying || isSyncing) { return; }
		isSyncing = true;
		console.log('attempting sync');
		
		var times = [], lowest;
		
		// reset sync target
		syncTargetPlayer = null;
		
	    $.each(players, function (_, player) {
	        var time = player.getCurrentTime();
			if (!lowest) lowest = time;
	        else { lowest = Math.min(lowest, time); }
	        times.push(time);
	    });
	
	    $.each(times, function (idx, time) {
	        var player = players[idx];
	
	        if (syncTargetPlayer === null && time === lowest) {
	            // we're the target video
	            unMute(idx);
	            syncTargetPlayer = player;
				console.log('sync target is %s', idx);
				$(player)
	                .removeClass('out-of-sync')
	                .addClass('in-sync')
					.addClass('sync-target');
	        } else {
	            mute(idx);
				$(player).removeClass('sync-target');
	        }
		});
		
		attemptSync();
	}
	
	function attemptSync() {
	    var times = [], diffs = [], inSync = 0;
	
	    $.each(players, function (idx, player) {
	        var player = players[idx];
	
			if (player === syncTargetPlayer) {
				return;
			}
			        
			var time = player.getCurrentTime(),
				syncTargetTime = syncTargetPlayer.getCurrentTime(),
	            diff = Math.abs(time - syncTargetTime);

            if (diff > allowedDiff / 1000) {
                // we need to be synced
                player.seekTo(syncTargetPlayer.getCurrentTime());
	            $(player)
	                .addClass('out-of-sync')
	                .removeClass('in-sync');
            } else {
				console.log('player %s is synced with %s seconds of lag (%s allowed)', idx, diff, (allowedDiff / 1000));
	
				inSync++;
	            $(player)
	                .removeClass('out-of-sync')
	                .addClass('in-sync');
            }

			times.push(time);
	        diffs.push(diff);
	    });
	
		if (inSync < 2) {
			queueAttemptSync();
		} else {
			isSyncing = false;
		}

	    console.log(times, diffs);
	}
	
	function queueAttemptSync() {
		stopAttemptSync();
		timeouts.attemptSync = setTimeout(attemptSync, intervals.attemptSync);
	}
	
	function stopAttemptSync() {
		clearTimeout(timeouts.attemptSync);
	}
	
	function play() {
		isPlaying = true;
		
		$.each(players, function (key, player) {
			player.playVideo();
		});
		
		//queueAttemptSync();
		queueCurrentTime();
		
		setPageClass('playing');
	}
	
	function onPlay(e) {
		e && e.preventDefault();
		play();
	}
	
	function pause() {
		stopCurrentTime();
		stopAttemptSync();
		
		isSyncing = false;
		isPlaying = false;
		
		$.each(players, function (key, player) {
			player.pauseVideo();
		});

		pollCurrentTime();

		setPageClass('paused');
	}
	
	function onPause(e) {
		e && e.preventDefault();
		pause();
	}
	
	function onSync(e) {
		e.preventDefault();
		beginAttemptSync();
	}
	
	function onMute(e) {
		var idx = $(this).index(),
			player = players[idx];
			
		if (player.isMuted()) {
			unMute(idx, true);
		} else {
			mute(idx, true);
		}
	}
	
	function onFwd(e) {}
	
	function onRew(e) {}
	
	function onSetTime(e) {
		e && e.preventDefault();
		
		var targetTime = +gui.targetTime.val();
		
		stopCurrentTime();
		
		$.each(players, function (_, player) {
			player.pauseVideo();
			player.seekTo(targetTime);
		});
		
		play();
	}
	
	function onSetSelectChange(e) {
		e && e.preventDefault();
		var values = gui.setSelect.val().split(',');
		gui.ids.each(function (idx, elem) {
			elem.val(values[idx]);
		});
		cueVideos();
	}
	
	function cueVideos() {
		pause();
		resetInitialized();
		setPageClass('loading');
		$.each(players, function (idx, player) {
			cueVideo(player, gui.ids[idx].val());
		});
	}
	
	function onCueVideos(e) {
		e && e.preventDefault();
		cueVideos();
	}
	
	function getSetFromQuery() {
		var numMatch = location.href.match(/[\?&]set=(\d+)/),
			numMatch = numMatch && numMatch[1],
			strMatch = numMatch === null && location.href.match(/[\?&]set=(([^&]+,){2}([^&]+))/),
			strMatch = strMatch && strMatch[1];
		return strMatch || numMatch;
	}

	$(function () {
		var i, player, embeds, setNum;
		
	    gui.mutes = $('button.mute').map(function () { return $(this); });
		gui.setSelect = $('#set');
		gui.ids = $('#ids input').map(function () { return $(this); });
		gui.cueVideos = $('#cue-videos');
		gui.play = $('#play');
		gui.pause = $('#pause');
		gui.sync = $('#sync');
		gui.fwd = $('#fwd');
		gui.rew = $('#rew');
		gui.current = $('#current');
		gui.total = $('#total');
		gui.targetTime = $('#target-time');
		gui.setTime = $('#set-time');
		gui.autoMute = $('#auto-mute');
			
		$('button.mute').click(onMute);
		gui.setSelect.change(onSetSelectChange);
		gui.cueVideos.click(onCueVideos);
		gui.play.click(onPlay);
		gui.pause.click(onPause);
		gui.sync.click(onSync);
		gui.fwd.click(onFwd);
		gui.rew.click(onRew);
		gui.setTime.click(onSetTime);
		gui.targetTime.keydown(function (e) { e.which === 13 && (e.preventDefault(), onSetTime()); });
		
		setPageClass('loading');
		
		// initialize set from query
		setValue = getSetFromQuery();
		if (!!+setValue) {
			gui.setSelect.find('option:eq(' + setValue + ')').prop('selected', true);
		} else {
			$('<option value="' + setValue + '">Incoming!</option>')
				.appendTo(gui.setSelect)
				.prop('selected', true);
		}
		
		// initialize video ids from select
		onSetSelectChange();

		embeds = $('embed');
		for (i = 0; i < 3; i++) {
			player = embeds.get(i);
			players[i] = player;
		}
	});
}(jQuery));