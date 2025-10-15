"""
Asterisk Manager Interface (AMI) Client
Handles communication with FreePBX/Asterisk for call control operations.
"""

import asyncio
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class AMIClient:
    """Async AMI client for Asterisk Manager Interface"""

    def __init__(self):
        self.host = os.getenv("AMI_HOST", "ipbx.statewidecentralstation.com")
        self.port = int(os.getenv("AMI_PORT", "5038"))
        self.username = os.getenv("AMI_USERNAME", "apiuser")
        self.secret = os.getenv("AMI_SECRET", "")
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.connected = False
        self.action_id_counter = 0

    async def connect(self) -> bool:
        """Connect to AMI server and authenticate"""
        try:
            self.reader, self.writer = await asyncio.open_connection(
                self.host, self.port
            )

            # Read AMI banner (single line)
            banner_line = await self.reader.readline()
            banner = banner_line.decode('utf-8').strip()
            logger.info(f"AMI Banner: {banner}")

            # Send login action
            await self._send_action({
                "Action": "Login",
                "Username": self.username,
                "Secret": self.secret
            })

            # Read login response and skip any Events (like FullyBooted)
            response = await self._read_response()

            # If we got an Event instead of Response, read next message
            while response.get("Event") and not response.get("Response"):
                logger.debug(f"Skipping event during login: {response.get('Event')}")
                response = await self._read_response()

            if response.get("Response") == "Success":
                self.connected = True
                logger.info("AMI login successful")
                return True
            else:
                logger.error(f"AMI login failed: {response.get('Message', 'Unknown error')}")
                return False

        except Exception as e:
            logger.error(f"AMI connection error: {e}")
            return False

    async def disconnect(self):
        """Disconnect from AMI server"""
        if self.writer:
            try:
                await self._send_action({"Action": "Logoff"})
                self.writer.close()
                await self.writer.wait_closed()
            except Exception as e:
                logger.error(f"Error during AMI disconnect: {e}")
            finally:
                self.connected = False
                self.reader = None
                self.writer = None

    async def _send_action(self, action: Dict[str, Any]):
        """Send an AMI action"""
        if not self.writer:
            raise RuntimeError("Not connected to AMI")

        # Add ActionID if not present
        if "ActionID" not in action:
            self.action_id_counter += 1
            action["ActionID"] = f"action_{self.action_id_counter}"

        # Build AMI message
        message = ""
        for key, value in action.items():
            message += f"{key}: {value}\r\n"
        message += "\r\n"

        self.writer.write(message.encode('utf-8'))
        await self.writer.drain()
        logger.debug(f"Sent AMI action: {action.get('Action')}")

    async def _read_response(self) -> Dict[str, str]:
        """Read an AMI response"""
        if not self.reader:
            raise RuntimeError("Not connected to AMI")

        response = {}
        while True:
            line = await self.reader.readline()
            if not line:
                break

            line = line.decode('utf-8').strip()
            if not line:  # Empty line marks end of response
                break

            if ':' in line:
                key, value = line.split(':', 1)
                response[key.strip()] = value.strip()

        return response

    async def retrieve_parked_call(self, parked_slot: str, extension: str, context: str = "from-internal") -> Dict[str, Any]:
        """
        Retrieve a parked call using Local channel to dial the parking slot,
        then bridge to the user's extension

        Args:
            parked_slot: The parking slot number (e.g., "71")
            extension: The SIP extension to send the call to
            context: The dialplan context (default: "from-internal")

        Returns:
            Dict with success status and message
        """
        try:
            if not self.connected:
                success = await self.connect()
                if not success:
                    return {"success": False, "message": "Failed to connect to AMI"}

            # Originate a call to retrieve parked call and bridge to extension
            # This uses the ParkedCall application to properly retrieve and bridge
            await self._send_action({
                "Action": "Originate",
                "Channel": f"PJSIP/{extension}",  # Call the user's extension
                "Application": "ParkedCall",  # When answered, run ParkedCall application
                "Data": parked_slot,  # Parking slot number
                "CallerID": f"Parked Call <{parked_slot}>",
                "Async": "true"
            })

            response = await self._read_response()
            logger.info(f"Originate response: {response}")

            # Skip any Events and look for Response message
            while response.get("Event") and not response.get("Response"):
                logger.debug(f"Skipping event: {response.get('Event')}")
                response = await self._read_response()
                logger.info(f"Next response: {response}")

            if response.get("Response") == "Success":
                logger.info(f"Successfully initiated retrieval of call from slot {parked_slot} to extension {extension}")
                return {
                    "success": True,
                    "message": f"Call retrieval initiated - extension {extension} will ring and connect to parked call",
                    "slot": parked_slot,
                    "extension": extension
                }
            else:
                error_msg = response.get("Message", "Unknown error")
                logger.error(f"Failed to retrieve call: {error_msg}. Full response: {response}")
                return {
                    "success": False,
                    "message": f"Failed to retrieve call: {error_msg}"
                }

        except Exception as e:
            logger.error(f"Error retrieving parked call: {e}")
            return {
                "success": False,
                "message": f"Error: {str(e)}"
            }
        finally:
            # Disconnect after operation
            await self.disconnect()

    async def get_parked_calls(self) -> Dict[str, Any]:
        """
        Get all currently parked calls
        Returns dict mapping ParkeeUniqueid to parking slot info
        """
        try:
            if not self.connected:
                success = await self.connect()
                if not success:
                    return {}

            # Request list of parked calls
            await self._send_action({"Action": "ParkedCalls"})

            # Read responses until we get "ParkedCallsComplete"
            parked_calls = {}
            while True:
                response = await self._read_response()
                if not response:
                    break

                event_type = response.get("Event")

                if event_type == "ParkedCall":
                    # Extract parking info
                    uniqueid = response.get("ParkeeUniqueid") or response.get("Uniqueid")
                    slot = response.get("ParkingSpace") or response.get("Exten")

                    if uniqueid and slot:
                        parked_calls[uniqueid] = {
                            "slot": slot,
                            "parkee_channel": response.get("ParkeeChannel", ""),
                            "parkee_caller_id": response.get("ParkeeCallerIDNum", ""),
                            "timeout": response.get("ParkingTimeout", "")
                        }
                        logger.debug(f"Found parked call: {uniqueid} in slot {slot}")

                elif event_type == "ParkedCallsComplete":
                    logger.info(f"Found {len(parked_calls)} parked calls")
                    break

            return parked_calls

        except Exception as e:
            logger.error(f"Error getting parked calls: {e}")
            return {}
        finally:
            await self.disconnect()

    async def find_parking_slot_by_uniqueid(self, uniqueid: str, max_attempts: int = 5, delay: float = 1.0) -> Optional[str]:
        """
        Poll AMI to find the parking slot for a given call uniqueid
        Retries with delay to handle race condition between Park() and AMI query

        Args:
            uniqueid: The call unique ID
            max_attempts: Maximum number of polling attempts
            delay: Delay between attempts in seconds

        Returns:
            Parking slot number or None if not found
        """
        for attempt in range(max_attempts):
            logger.info(f"Polling for parking slot (attempt {attempt + 1}/{max_attempts}) for uniqueid: {uniqueid}")

            parked_calls = await self.get_parked_calls()

            if uniqueid in parked_calls:
                slot = parked_calls[uniqueid]["slot"]
                logger.info(f"Found parking slot {slot} for uniqueid {uniqueid}")
                return slot

            if attempt < max_attempts - 1:
                logger.debug(f"Parking slot not found yet, waiting {delay}s before retry...")
                await asyncio.sleep(delay)

        logger.warning(f"Could not find parking slot for uniqueid {uniqueid} after {max_attempts} attempts")
        return None

    async def get_channel_status(self, channel: str) -> Dict[str, Any]:
        """Get the status of a specific channel"""
        try:
            if not self.connected:
                await self.connect()

            await self._send_action({
                "Action": "Status",
                "Channel": channel
            })

            response = await self._read_response()
            return response

        except Exception as e:
            logger.error(f"Error getting channel status: {e}")
            return {}

    async def originate_call(self, extension: str, number: str) -> Dict[str, Any]:
        """
        Originate a call from an extension to a number

        Args:
            extension: SIP extension to call first
            number: Number to call after extension answers

        Returns:
            Dict with success status and message
        """
        try:
            if not self.connected:
                await self.connect()

            await self._send_action({
                "Action": "Originate",
                "Channel": f"PJSIP/{extension}",
                "Exten": number,
                "Context": "from-internal",
                "Priority": "1",
                "CallerID": f"Monitoring <{extension}>"
            })

            response = await self._read_response()

            if response.get("Response") == "Success":
                return {"success": True, "message": "Call originated successfully"}
            else:
                return {"success": False, "message": response.get("Message", "Failed to originate call")}

        except Exception as e:
            logger.error(f"Error originating call: {e}")
            return {"success": False, "message": str(e)}
        finally:
            await self.disconnect()

    async def _get_parked_calls_raw(self) -> Dict[str, Any]:
        """
        Internal method to get parked calls without disconnecting
        Used by hangup_parked_call to maintain connection
        """
        # Request list of parked calls
        await self._send_action({"Action": "ParkedCalls"})

        # Read responses until we get "ParkedCallsComplete"
        parked_calls = {}
        while True:
            response = await self._read_response()
            if not response:
                break

            event_type = response.get("Event")

            if event_type == "ParkedCall":
                # Extract parking info
                uniqueid = response.get("ParkeeUniqueid") or response.get("Uniqueid")
                slot = response.get("ParkingSpace") or response.get("Exten")

                if uniqueid and slot:
                    parked_calls[uniqueid] = {
                        "slot": slot,
                        "parkee_channel": response.get("ParkeeChannel", ""),
                        "parkee_caller_id": response.get("ParkeeCallerIDNum", ""),
                        "timeout": response.get("ParkingTimeout", "")
                    }
                    logger.debug(f"Found parked call: {uniqueid} in slot {slot}")

            elif event_type == "ParkedCallsComplete":
                logger.info(f"Found {len(parked_calls)} parked calls")
                break

        return parked_calls

    async def hangup_parked_call(self, parked_slot: str) -> Dict[str, Any]:
        """
        Hang up a parked call by its parking slot number

        Args:
            parked_slot: The parking slot number (e.g., "71")

        Returns:
            Dict with success status and message
        """
        try:
            if not self.connected:
                success = await self.connect()
                if not success:
                    return {"success": False, "message": "Failed to connect to AMI"}

            # First, get all parked calls to find the channel for this slot
            # Use internal method that doesn't disconnect
            parked_calls = await self._get_parked_calls_raw()

            # Find the channel for this parking slot
            target_channel = None
            for uniqueid, call_info in parked_calls.items():
                if call_info.get("slot") == parked_slot:
                    target_channel = call_info.get("parkee_channel")
                    logger.info(f"Found channel {target_channel} in parking slot {parked_slot}")
                    break

            if not target_channel:
                logger.warning(f"No parked call found in slot {parked_slot}")
                return {
                    "success": False,
                    "message": f"No parked call found in slot {parked_slot}"
                }

            # Send Hangup action for the channel
            await self._send_action({
                "Action": "Hangup",
                "Channel": target_channel
            })

            response = await self._read_response()

            # Skip any Events and look for Response message
            while response.get("Event") and not response.get("Response"):
                logger.debug(f"Skipping event: {response.get('Event')}")
                response = await self._read_response()

            if response.get("Response") == "Success":
                logger.info(f"Successfully hung up parked call in slot {parked_slot}")
                return {
                    "success": True,
                    "message": f"Successfully hung up call in parking slot {parked_slot}",
                    "slot": parked_slot,
                    "channel": target_channel
                }
            else:
                error_msg = response.get("Message", "Unknown error")
                logger.error(f"Failed to hang up call: {error_msg}")
                return {
                    "success": False,
                    "message": f"Failed to hang up call: {error_msg}"
                }

        except Exception as e:
            logger.error(f"Error hanging up parked call in slot {parked_slot}: {e}")
            return {
                "success": False,
                "message": f"Error: {str(e)}"
            }
        finally:
            # Disconnect after operation
            await self.disconnect()
