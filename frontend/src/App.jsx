import { useState, useRef, useEffect } from 'react'
import './App.css'

function App() {
    const [videoUrl, setVideoUrl] = useState(null)
    const [file, setFile] = useState(null)
    const [transcription, setTranscription] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [targetLang, setTargetLang] = useState('')
    const [currentTime, setCurrentTime] = useState(0)
    const videoRef = useRef(null)

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0]
        if (selectedFile) {
            setFile(selectedFile)
            setVideoUrl(URL.createObjectURL(selectedFile))
        }
    }

    const handleTranscribe = async () => {
        if (!file) return

        setIsProcessing(true)
        setTranscription([]) // Clear previous transcription

        const formData = new FormData()
        formData.append('file', file)
        if (targetLang) {
            formData.append('target_lang', targetLang)
        }

        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            })

            if (!response.body) throw new Error('No response body')

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { value, done } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')

                // Keep the last partial line in the buffer
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.trim()) continue
                    try {
                        const data = JSON.parse(line)
                        if (data.status === 'processing' || data.status === 'completed') {
                            console.log('Backend status:', data.status)
                            continue
                        }

                        // Add new segment to the list
                        setTranscription(prev => [...prev, data])
                    } catch (e) {
                        console.error('Error parsing line:', line, e)
                    }
                }
            }
        } catch (error) {
            console.error('Transcription failed:', error)
            alert('Transcription failed. Ensure the backend is running.')
        } finally {
            setIsProcessing(false)
        }
    }

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime)
        }

        video.addEventListener('timeupdate', handleTimeUpdate)
        return () => video.removeEventListener('timeupdate', handleTimeUpdate)
    }, [videoUrl])

    // Auto-transcribe when file is selected
    useEffect(() => {
        if (file) {
            handleTranscribe()
        }
    }, [file])

    const MAX_CAPTION_DURATION = 4 // Seconds

    const activeSegment = transcription.find(
        (s) => currentTime >= s.start && currentTime <= Math.min(s.end, s.start + MAX_CAPTION_DURATION)
    )

    return (
        <div className="app-container">
            <header>
                <div className="logo">AI-VLC 🚀</div>
                <h1>Next-Gen AI Media Player</h1>
            </header>

            <main>
                <div className="player-section" style={{ flex: 1, width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
                    <div className="video-wrapper" style={{ position: 'relative', background: '#000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                        {videoUrl ? (
                            <video ref={videoRef} src={videoUrl} controls style={{ width: '100%', display: 'block' }} />
                        ) : (
                            <div className="placeholder" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', flexDirection: 'column' }}>
                                <p>Drag and drop or select a video file</p>
                                <input type="file" accept="video/*" onChange={handleFileChange} />
                            </div>
                        )}

                        {/* AI Overlay Captions - Internal to Video Pane */}
                        <div className="overlay-captions" style={{
                            position: 'absolute',
                            bottom: '10%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '80%',
                            textAlign: 'center',
                            pointerEvents: 'none',
                            zIndex: 10
                        }}>
                            {activeSegment && (
                                <div className="active-segment" style={{
                                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                    backdropFilter: 'blur(4px)',
                                    color: '#fff',
                                    display: 'inline-block',
                                    padding: '8px 20px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    <p className="original" style={{
                                        margin: 0,
                                        fontSize: '1.4rem',
                                        fontWeight: '500',
                                        textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                                    }}>{activeSegment.text}</p>
                                    {activeSegment.translation && (
                                        <p className="translated" style={{
                                            margin: '4px 0 0 0',
                                            fontSize: '1.2rem',
                                            color: '#ffeb3b',
                                            fontWeight: '500',
                                            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                                        }}>{activeSegment.translation}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="controls-bar" style={{ display: 'flex', gap: '10px', marginTop: '15px', alignItems: 'center', justifyContent: 'center' }}>
                        {videoUrl && <input type="file" accept="video/*" onChange={handleFileChange} />}
                        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} style={{ padding: '10px', borderRadius: '6px', background: '#333', color: 'white', border: 'none' }}>
                            <option value="">No Translation</option>
                            <option value="fr">French</option>
                            <option value="es">Spanish</option>
                            <option value="de">German</option>
                            <option value="it">Italian</option>
                        </select>
                        <button onClick={handleTranscribe} disabled={!file || isProcessing} style={{ padding: '10px 20px', borderRadius: '6px', background: '#646cff', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                            {isProcessing ? '🤖 Processing...' : '✨ AI Transcribe'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}

export default App
