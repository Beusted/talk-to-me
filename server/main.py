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
    def __init__(self, room: rtc.Room, lang: Enum):
        self.room = room
        self.lang = lang
        self.context = llm.ChatContext().append(
            role="system",
            text=(
                f"You are a translator for language: {lang.value}. "
                f"Your only response should be the exact translation of input text in the {lang.value} language."
            ),
        )
        self.llm = openai.LLM(model="gpt-3.5-turbo")
        self.tts = openai.TTS(voice="alloy")  # Using alloy voice for all languages
        self.audio_source = None
        self.audio_track = None

    async def translate(self, message: str, track: rtc.Track):
        try:
            logger.info(f"Translating to {self.lang.value}: {message}")
            self.context.append(text=message, role="user")

            logger.info("Starting OpenAI LLM chat stream...")
            stream = self.llm.chat(chat_ctx=self.context)

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
                self.room.local_participant.identity, track.sid, [segment]
            )
            await self.room.local_participant.publish_transcription(transcription)

            logger.info(f"Published {self.lang.value} transcription with language={self.lang.name}")
            print(
                f"message: {message}, translated to {self.lang.value}: {translated_message}"
            )

            # Generate and publish TTS audio
            await self._publish_tts_audio(translated_message)
        except Exception as e:
            logger.error(f"Translation error: {e}", exc_info=True)

    async def _publish_tts_audio(self, text: str):
        """Generate TTS audio and publish it to the room"""
        try:
            logger.info(f"Generating TTS for: {text}")

            # Create audio source and track if they don't exist
            if self.audio_source is None:
                self.audio_source = rtc.AudioSource(24000, 1)  # 24kHz, mono
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

            # Generate TTS audio using non-streaming synthesis
            logger.info("Synthesizing TTS audio...")
            tts_output = await self.tts.synthesize(text)

            # Capture audio frames from the synthesized output
            logger.info("Capturing TTS audio frames...")
            frame_count = 0
            async for audio_event in tts_output:
                await self.audio_source.capture_frame(audio_event.frame)
                frame_count += 1

            logger.info(f"TTS audio complete: captured {frame_count} frames for {self.lang.value}")
        except Exception as e:
            logger.error(f"TTS error: {e}", exc_info=True)


async def entrypoint(job: JobContext):
    tasks = []
    translators = {}

    # Lazy initialization of STT provider
    def get_stt_provider():
        return deepgram.STT(
            model="nova-3",
            language="multi",
            interim_results=True,
            smart_format=True,
            punctuate=True,
        )

    async def _forward_transcription(
        stt_stream: stt.SpeechStream,
        stt_forwarder: transcription.STTSegmentsForwarder,
        track: rtc.Track,
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
                for translator in translators.values():
                    asyncio.create_task(translator.translate(message, track))

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
            _forward_transcription(stt_stream, stt_forwarder, track)
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
        lang = changed_attributes.get("captions_language", None)
        if lang and lang != "en" and lang not in translators:
            try:
                # Create a translator for the requested language
                target_language = LanguageCode[lang].value
                translators[lang] = Translator(job.room, LanguageCode[lang])
                logger.info(f"Added translator for language: {target_language}")
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
