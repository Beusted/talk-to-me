import asyncio
import logging
import json

from enum import Enum
from dataclasses import dataclass, asdict

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    JobRequest,
    WorkerOptions,
    cli,
    stt,
    llm,
    transcription,
    utils,
)
from livekit.plugins import openai, deepgram, silero
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("transcriber")


@dataclass
class Language:
    code: str
    name: str
    flag: str


languages = {
    "en": Language(code="en", name="English", flag="🇺🇸"),
    "vi": Language(code="vi", name="Vietnamese", flag="🇻🇳"),
    "tl": Language(code="tl", name="Tagalog", flag="🇵🇭"),
    "es": Language(code="es", name="Spanish", flag="🇪🇸"),
    "zh": Language(code="zh", name="Mandarin Chinese", flag="🇨🇳"),
}

LanguageCode = Enum(
    "LanguageCode",  # Name of the Enum
    {code: lang.name for code, lang in languages.items()},  # Enum entries
)


class Translator:
    def __init__(self, room: rtc.Room, lang: Enum, mode: str = "multi"):
        self.room = room
        self.lang = lang
        self.mode = mode
        self.system_prompt = (
            f"You are a professional translator. Translate ALL input text to {lang.value}. "
            f"ALWAYS translate every single word, including numbers, names, and common phrases. "
            f"Never leave any words untranslated. Only output the translation, nothing else. "
            f"For example: 'uno dos tres' becomes 'one two three' in English."
        )
        self.llm = openai.LLM(model="gpt-3.5-turbo")
        self.tts = openai.TTS(voice="alloy")  # Using alloy voice for all languages
        self.audio_source = None
        self.audio_track = None
        self.enable_tts = (mode == "single")  # Enable TTS in single mode

    async def translate(self, message: str, track: rtc.Track, participant: rtc.RemoteParticipant):
        try:
            logger.info(f"Translating to {self.lang.value}: {message}")

            # Create a fresh context for each translation to avoid accumulation
            context = llm.ChatContext().append(
                role="system",
                text=self.system_prompt
            ).append(text=message, role="user")

            logger.info("Starting OpenAI LLM chat stream...")
            stream = self.llm.chat(chat_ctx=context)

            translated_message = ""
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content is None:
                    break
                translated_message += content

            logger.info(f"Translation complete: {translated_message}")

            # Publish text transcription as captions
            segment = rtc.TranscriptionSegment(
                id="SG_" + utils.misc.shortuuid(),
                text=translated_message,
                start_time=0,
                end_time=0,
                language=self.lang.name,
                final=True,
            )
            transcription = rtc.Transcription(
                participant.identity, track.sid, [segment]
            )
            await self.room.local_participant.publish_transcription(transcription)

            logger.info(f"Published {self.lang.value} transcription with language={self.lang.name}")
            print(
                f"message: {message}, translated to {self.lang.value}: {translated_message}"
            )

            # Generate and publish TTS audio if enabled
            if self.enable_tts:
                logger.info(f"TTS enabled for {self.mode} mode, generating audio...")
                await self._publish_tts_audio(translated_message)
            else:
                logger.info(f"TTS disabled for {self.mode} mode, skipping audio generation")
        except Exception as e:
            logger.error(f"Translation error: {e}", exc_info=True)

    async def _publish_tts_audio(self, text: str):
        """Generate TTS audio and publish it to the room"""
        try:
            logger.info(f"Generating TTS for: {text}")

            # Generate TTS audio using streaming synthesis
            logger.info("Synthesizing TTS audio...")
            tts_stream = self.tts.synthesize(text)

            # Capture audio frames from the synthesized output
            logger.info("Capturing TTS audio frames...")
            frame_count = 0
            async for audio_event in tts_stream:
                # Create audio source and track on first frame (to match TTS output format)
                if self.audio_source is None:
                    frame = audio_event.frame
                    logger.info(f"Creating audio source with sample_rate={frame.sample_rate}, channels={frame.num_channels}")
                    self.audio_source = rtc.AudioSource(frame.sample_rate, frame.num_channels)
                    self.audio_track = rtc.LocalAudioTrack.create_audio_track(
                        f"tts-{self.lang.name}",
                        self.audio_source
                    )
                    # Publish the audio track
                    await self.room.local_participant.publish_track(
                        self.audio_track,
                        rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
                    )
                    logger.info(f"Published TTS audio track: tts-{self.lang.name} for {self.lang.value}")

                await self.audio_source.capture_frame(audio_event.frame)
                frame_count += 1

            logger.info(f"TTS audio complete: captured {frame_count} frames for {self.lang.value}")
        except Exception as e:
            logger.error(f"TTS error: {e}", exc_info=True)


async def entrypoint(job: JobContext):
    tasks = []
    translators = {}
    mode = "multi"  # Track current mode
    input_language = None
    output_language = None

    # Lazy initialization of STT provider
    def get_stt_provider():
        return deepgram.STT(
            model="nova-2",
            language="multi",
            interim_results=True,
            smart_format=True,
            punctuate=True,
        )

    async def _forward_transcription(
        stt_stream: stt.SpeechStream,
        stt_forwarder: transcription.STTSegmentsForwarder,
        track: rtc.Track,
        participant: rtc.RemoteParticipant,
    ):
        """Forward the transcription and log the transcript in the console"""
        logger.info("Started transcription forwarding for track")
        async for ev in stt_stream:
            logger.info(f"Received STT event: {ev.type}")
            stt_forwarder.update(ev)
            # log to console
            if ev.type == stt.SpeechEventType.INTERIM_TRANSCRIPT:
                print(ev.alternatives[0].text, end="")
            elif ev.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                print("\n")
                print(" -> ", ev.alternatives[0].text)

                message = ev.alternatives[0].text

                # In single mode, only translate to the output language
                if mode == "single" and output_language:
                    # Only use the output language translator
                    if output_language in translators:
                        logger.info(f"Single mode: Translating to output language ({output_language})")
                        asyncio.create_task(translators[output_language].translate(message, track, participant))
                    else:
                        logger.warning(f"Output language translator not found: {output_language}")
                else:
                    # Multi mode: translate to all languages
                    for translator in translators.values():
                        asyncio.create_task(translator.translate(message, track, participant))

    async def transcribe_track(participant: rtc.RemoteParticipant, track: rtc.Track):
        audio_stream = rtc.AudioStream(track)
        stt_forwarder = transcription.STTSegmentsForwarder(
            room=job.room, participant=participant, track=track
        )

        # BYPASS VAD - Send frames directly to STT for testing
        # Initialize STT provider here (lazy initialization)
        stt_provider = get_stt_provider()
        stt_stream = stt_provider.stream()

        stt_task = asyncio.create_task(
            _forward_transcription(stt_stream, stt_forwarder, track, participant)
        )
        tasks.append(stt_task)

        logger.info("Starting to receive audio frames and sending directly to STT (VAD bypassed)")
        frame_count = 0
        try:
            async for ev in audio_stream:
                frame_count += 1
                if frame_count % 100 == 0:  # Log every 100 frames
                    logger.info(f"Received {frame_count} audio frames, pushing to STT")

                # Push directly to STT (bypassing VAD for now)
                stt_stream.push_frame(ev.frame)
        except Exception as e:
            logger.error(f"Error in audio stream processing: {e}", exc_info=True)
        finally:
            # Close the STT stream when done
            await stt_stream.aclose()
            logger.info("STT stream closed")

    @job.room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(f"Adding transcriber for participant: {participant.identity}")
            tasks.append(asyncio.create_task(transcribe_track(participant, track)))

    @job.room.on("participant_attributes_changed")
    def on_attributes_changed(
        changed_attributes: dict[str, str], participant: rtc.Participant
    ):
        """
        When participant attributes change, handle new translation requests.
        """
        nonlocal mode, input_language, output_language

        # Check if this is single-user mode
        current_mode = changed_attributes.get("mode", None)

        if current_mode:
            mode = current_mode

        if mode == "single":
            # Single-user mode: translate to both input and output languages
            input_lang = changed_attributes.get("input_language", None)
            output_lang = changed_attributes.get("output_language", None)

            # Update the stored languages
            if input_lang:
                input_language = input_lang
            if output_lang:
                output_language = output_lang

            logger.info(f"Single-user mode detected. Input: {input_language}, Output: {output_language}")

            # Create translators for both languages if they don't exist
            # (We create both but only use output_language for translation)
            for lang in [input_language, output_language]:
                if lang and lang not in translators:
                    try:
                        target_language = LanguageCode[lang].value
                        translators[lang] = Translator(job.room, LanguageCode[lang], mode="single")
                        logger.info(f"Added translator for language: {target_language} (single mode with TTS)")
                    except KeyError:
                        logger.warning(f"Unsupported language requested: {lang}")
        else:
            # Multi-user mode: original behavior
            lang = changed_attributes.get("captions_language", None)
            if lang and lang != "en" and lang not in translators:
                try:
                    # Create a translator for the requested language
                    target_language = LanguageCode[lang].value
                    translators[lang] = Translator(job.room, LanguageCode[lang], mode="multi")
                    logger.info(f"Added translator for language: {target_language} (multi mode)")
                except KeyError:
                    logger.warning(f"Unsupported language requested: {lang}")

    await job.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    @job.room.local_participant.register_rpc_method("get/languages")
    async def get_languages(data: rtc.RpcInvocationData):
        languages_list = [asdict(lang) for lang in languages.values()]
        return json.dumps(languages_list)

    logger.info("RPC method 'get/languages' registered")


async def request_fnc(req: JobRequest):
    await req.accept(
        name="agent",
        identity="agent",
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint, request_fnc=request_fnc
        )
    )
